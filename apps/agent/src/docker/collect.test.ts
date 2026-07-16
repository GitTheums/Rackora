import { describe, expect, it } from "vitest";
import { collectDockerTelemetry } from "./collect.js";
import { createFakeDockerClient, sampleFakeDockerData } from "./fake.js";

describe("docker telemetry collector", () => {
  it("collects engine, containers, images and stats via read-only APIs", async () => {
    const data = sampleFakeDockerData();
    const client = createFakeDockerClient(data);
    const telemetry = await collectDockerTelemetry({ client });

    expect(telemetry.available).toBe(true);
    expect(telemetry.engine?.version).toBe("27.1.0");
    expect(telemetry.containers).toHaveLength(1);
    expect(telemetry.images).toHaveLength(2);

    const container = telemetry.containers[0]!;
    expect(container.name).toBe("compose-web-1");
    expect(container.state).toBe("running");
    expect(container.health).toBe("healthy");
    expect(container.labels).toEqual({
      "com.docker.compose.service": "web",
      "com.docker.compose.project": "demo",
    });
    expect(container.labels["secret.env"]).toBeUndefined();
    expect(container.stats?.cpuPercent).toBeGreaterThan(0);
    expect(container.stats?.memoryUsageBytes).toBe(18_000_000);
    expect(container.stats?.memoryPercent).toBeGreaterThan(0);
    expect(container.stats?.netRxBytes).toBe(1000);
    expect(container.stats?.blockWriteBytes).toBe(4000);
    expect(container.shortId).toBe(container.id.slice(0, 12));
    expect(container.imageId).toBe("sha256:abc123def4567890");
    expect(container.restartCount).toBe(2);
    expect(container.startedAt).toBe("2024-07-03T12:05:00.000Z");

    const image = telemetry.images[0]!;
    expect(image.repositoryTags).toEqual(["nginx:1.27", "nginx:latest"]);
    expect(image.digests[0]).toContain("@sha256:");

    // Redaction: serialized telemetry must not include secrets/commands/mounts.
    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain("SECRET=super-secret");
    expect(serialized).not.toContain("daemon off");
    expect(serialized).not.toContain("/home/user/.ssh");
    expect(serialized).not.toContain("should-not-pass");
  });

  it("returns unavailable when ping fails", async () => {
    const client = createFakeDockerClient({ pingOk: false });
    const telemetry = await collectDockerTelemetry({ client });
    expect(telemetry.available).toBe(false);
    expect(telemetry.error).toMatch(/ping/i);
  });
});
