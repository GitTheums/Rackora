import { describe, expect, it } from "vitest";
import {
  AGENT_TELEMETRY_MAX_BYTES,
  jsonByteLength,
  type DockerTelemetry,
  type HostTelemetry,
} from "@rackora/shared";
import { buildAgentTelemetry, createTelemetryBatchState } from "./build.js";

function sampleHost(): HostTelemetry {
  return {
    hostname: "host-a",
    os: "Linux",
    architecture: "x64",
    uptimeSeconds: 100,
    cpu: { usagePercent: 10, loadAverage: [0.1, 0.1, 0.1], cores: 2 },
    memory: { totalBytes: 1000, usedBytes: 400, availableBytes: 600 },
    filesystems: [],
    temperatures: [],
  };
}

function sampleDocker(count: number): DockerTelemetry {
  return {
    available: true,
    engine: { version: "27.0.0" },
    containers: Array.from({ length: count }, (_, index) => ({
      id: `id-${index}`,
      name: `container-${index}`,
      image: "nginx:latest",
      state: "running" as const,
      health: "none" as const,
      createdAt: "2026-07-16T10:00:00.000Z",
      labels: {},
      stats: {
        cpuPercent: 1,
        memoryUsageBytes: 1,
        memoryLimitBytes: 2,
        netRxBytes: 3,
        netTxBytes: 4,
        blockReadBytes: 5,
        blockWriteBytes: 6,
      },
    })),
    images: Array.from({ length: count }, (_, index) => ({
      id: `img-${index}`,
      repositoryTags: [`app:${index}`],
      digests: [`app@sha256:${"a".repeat(64)}`],
      sizeBytes: 1000,
    })),
    containerTotal: count,
    imageTotal: count,
  };
}

describe("telemetry build", () => {
  it("batches containers across heartbeats", () => {
    const batchState = createTelemetryBatchState();
    const docker = sampleDocker(5);

    const first = buildAgentTelemetry({
      agentName: "host-a",
      agentVersion: "0.1.0",
      host: sampleHost(),
      docker,
      batchState,
      maxContainers: 2,
      maxImages: 2,
    });
    expect(first.docker.containers.map((c) => c.name)).toEqual([
      "container-0",
      "container-1",
    ]);
    expect(first.batch?.truncated).toBe(false);

    const second = buildAgentTelemetry({
      agentName: "host-a",
      agentVersion: "0.1.0",
      host: sampleHost(),
      docker,
      batchState,
      maxContainers: 2,
      maxImages: 2,
    });
    expect(second.docker.containers.map((c) => c.name)).toEqual([
      "container-2",
      "container-3",
    ]);
  });

  it("truncates to stay under the payload byte limit", () => {
    const docker = sampleDocker(40);
    const payload = buildAgentTelemetry({
      agentName: "host-a",
      agentVersion: "0.1.0",
      host: sampleHost(),
      docker,
      maxBytes: 4_000,
      maxContainers: 40,
      maxImages: 40,
    });

    expect(jsonByteLength(payload)).toBeLessThanOrEqual(4_000);
    expect(payload.batch?.truncated).toBe(true);
    expect(AGENT_TELEMETRY_MAX_BYTES).toBeGreaterThan(4_000);
  });
});
