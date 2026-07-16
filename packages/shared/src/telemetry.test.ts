import { describe, expect, it } from "vitest";
import {
  calculateAgentConnectionStatus,
} from "./agents.js";
import {
  AGENT_TELEMETRY_MAX_BYTES,
  agentTelemetryV1Schema,
  filterDockerLabels,
  isAllowedFilesystemMount,
  jsonByteLength,
  TELEMETRY_SCHEMA_VERSION,
} from "./telemetry.js";

describe("telemetry schemas", () => {
  it("parses a valid v1 telemetry payload", () => {
    const payload = agentTelemetryV1Schema.parse({
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      collectedAt: "2026-07-16T11:00:00.000Z",
      agent: { name: "host-a", version: "0.1.0" },
      host: {
        hostname: "host-a",
        os: "Linux 6.1",
        architecture: "x64",
        uptimeSeconds: 3600,
        cpu: {
          usagePercent: 12.5,
          loadAverage: [0.1, 0.2, 0.3],
          cores: 4,
        },
        memory: {
          totalBytes: 8_000_000_000,
          usedBytes: 2_000_000_000,
          availableBytes: 6_000_000_000,
        },
        filesystems: [
          {
            mountpoint: "/",
            fstype: "ext4",
            totalBytes: 100,
            usedBytes: 40,
            availableBytes: 60,
          },
        ],
        temperatures: [
          { name: "zone0", celsius: 45.5, source: "thermal" },
        ],
      },
      docker: {
        available: true,
        engine: { version: "27.0.0", apiVersion: "1.46" },
        containers: [
          {
            id: "abc123",
            name: "nginx",
            image: "nginx:latest",
            state: "running",
            health: "healthy",
            createdAt: "2026-07-16T10:00:00.000Z",
            labels: { "com.docker.compose.service": "web" },
            stats: {
              cpuPercent: 1.2,
              memoryUsageBytes: 10_000_000,
              memoryLimitBytes: 100_000_000,
              netRxBytes: 1,
              netTxBytes: 2,
              blockReadBytes: 3,
              blockWriteBytes: 4,
            },
          },
        ],
        images: [
          {
            id: "sha256:deadbeef",
            repositoryTags: ["nginx:latest"],
            digests: ["nginx@sha256:abcd"],
            sizeBytes: 50_000_000,
          },
        ],
        containerTotal: 1,
        imageTotal: 1,
      },
      batch: { index: 0, total: 1, truncated: false },
    });

    expect(payload.schemaVersion).toBe(1);
    expect(payload.docker.containers[0]?.health).toBe("healthy");
  });

  it("filters docker labels to the allowlist", () => {
    expect(
      filterDockerLabels({
        "com.docker.compose.service": "api",
        "secret.label": "nope",
        maintainer: "rackora",
      }),
    ).toEqual({
      "com.docker.compose.service": "api",
      maintainer: "rackora",
    });
  });

  it("checks filesystem allowlist mounts", () => {
    expect(isAllowedFilesystemMount("/")).toBe(true);
    expect(isAllowedFilesystemMount("/var/lib/docker")).toBe(true);
    expect(isAllowedFilesystemMount("/mnt/data")).toBe(true);
    expect(isAllowedFilesystemMount("/tmp")).toBe(false);
    expect(isAllowedFilesystemMount("/proc")).toBe(false);
  });

  it("exposes a sensible payload byte limit", () => {
    expect(AGENT_TELEMETRY_MAX_BYTES).toBeGreaterThan(50_000);
    expect(jsonByteLength({ a: 1 })).toBeGreaterThan(0);
  });

  it("calculates agent connection status from heartbeat freshness", () => {
    const now = Date.parse("2026-07-16T12:00:00.000Z");
    expect(
      calculateAgentConnectionStatus({
        revoked: true,
        lastHeartbeatAt: new Date(now - 1_000).toISOString(),
        nowMs: now,
      }),
    ).toBe("revoked");
    expect(
      calculateAgentConnectionStatus({
        revoked: false,
        lastHeartbeatAt: new Date(now - 30_000).toISOString(),
        nowMs: now,
      }),
    ).toBe("online");
    expect(
      calculateAgentConnectionStatus({
        revoked: false,
        lastHeartbeatAt: new Date(now - 120_000).toISOString(),
        nowMs: now,
      }),
    ).toBe("degraded");
    expect(
      calculateAgentConnectionStatus({
        revoked: false,
        lastHeartbeatAt: new Date(now - 10 * 60_000).toISOString(),
        nowMs: now,
      }),
    ).toBe("offline");
    expect(
      calculateAgentConnectionStatus({
        revoked: false,
        lastHeartbeatAt: null,
        nowMs: now,
      }),
    ).toBe("offline");
  });
});
