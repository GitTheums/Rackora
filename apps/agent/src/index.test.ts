import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_HEARTBEAT_INTERVAL_MS,
  TELEMETRY_SCHEMA_VERSION,
  type AgentTelemetryV1,
} from "@rackora/shared";
import { createBackoff, nextBackoffDelay, resetBackoff } from "./backoff.js";
import { signAgentPayload } from "./auth.js";
import { loadCredentials } from "./credentials.js";
import {
  formatAgentStatus,
  formatHealthLog,
  getAgentInfo,
  runAgent,
} from "./index.js";

function sampleTelemetry(): AgentTelemetryV1 {
  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    collectedAt: "2026-07-16T11:00:00.000Z",
    agent: { name: "host-a", version: "0.1.0" },
    host: {
      hostname: "host-a",
      os: "Linux",
      architecture: "x64",
      uptimeSeconds: 10,
      cpu: { usagePercent: 1, loadAverage: [0, 0, 0], cores: 1 },
      memory: { totalBytes: 1, usedBytes: 1 },
      filesystems: [],
      temperatures: [],
    },
    docker: {
      available: true,
      engine: { version: "27.0.0" },
      containers: [],
      images: [],
      containerTotal: 0,
      imageTotal: 0,
    },
  };
}

describe("rackora-agent", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports idle status with the shared version", () => {
    const info = getAgentInfo();
    expect(info.name).toBe("rackora-agent");
    expect(info.status).toBe("idle");
    expect(formatAgentStatus(info)).toContain(`v${info.version}`);
  });

  it("defaults heartbeat interval to 30 seconds", () => {
    expect(AGENT_HEARTBEAT_INTERVAL_MS).toBe(30_000);
  });

  it("formats a health-like status line", () => {
    const line = formatHealthLog({
      enrolled: true,
      agentName: "host-a",
      agentId: "550e8400-e29b-41d4-a716-446655440000",
      lastHeartbeatAt: "2026-07-16T10:00:00.000Z",
      status: "running",
      dockerAvailable: true,
    });
    expect(line).toContain("rackora-agent health:");
    expect(line).toContain("enrolled=true");
    expect(line).toContain("docker=true");
  });

  it("applies exponential backoff", () => {
    const state = createBackoff({ initialMs: 1000, maxMs: 8000, factor: 2 });
    expect(
      nextBackoffDelay(state, { initialMs: 1000, maxMs: 8000, factor: 2 }),
    ).toBe(1000);
    expect(
      nextBackoffDelay(state, { initialMs: 1000, maxMs: 8000, factor: 2 }),
    ).toBe(2000);
    resetBackoff(state, { initialMs: 1000 });
    expect(
      nextBackoffDelay(state, { initialMs: 1000, maxMs: 8000, factor: 2 }),
    ).toBe(1000);
  });

  it("enrolls once, sends telemetry heartbeat, and stores credentials", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "rackora-agent-"));
    dirs.push(dataDir);

    const enroll = vi.fn(async () => ({
      agentId: "550e8400-e29b-41d4-a716-446655440000",
      secret: "test-agent-secret",
      name: "host-a",
    }));
    const heartbeat = vi.fn(async () => ({
      ok: true as const,
      receivedAt: "2026-07-16T10:00:00.000Z",
    }));
    const telemetry = sampleTelemetry();

    const logs: string[] = [];
    await runAgent({
      env: {
        CORE_URL: "http://127.0.0.1:7575",
        ENROLLMENT_TOKEN: "one-time-token",
        AGENT_NAME: "host-a",
        DATA_DIR: dataDir,
        HEARTBEAT_INTERVAL_MS: "1",
        DOCKER_SOCKET: "",
      },
      client: { enroll, heartbeat },
      dockerClient: null,
      telemetryCollector: {
        collect: async () => telemetry,
      },
      sleep: async () => undefined,
      log: (message) => logs.push(message),
      maxIterations: 1,
    });

    expect(enroll).toHaveBeenCalledTimes(1);
    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(heartbeat.mock.calls[0]?.[0]).toMatchObject({
      agentId: "550e8400-e29b-41d4-a716-446655440000",
      secret: "test-agent-secret",
      telemetry,
    });

    const stored = loadCredentials(dataDir);
    expect(stored?.agentId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(readFileSync(path.join(dataDir, "credentials.json"), "utf8")).toContain(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(logs.some((line) => line.includes("enrolled=true"))).toBe(true);
  });

  it("signs payloads as timestamp.nonce.body", () => {
    const signature = signAgentPayload(
      "secret",
      "1710000000000",
      "abc",
      '{"status":"ok"}',
    );
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });
});
