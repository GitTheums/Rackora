import { describe, expect, it } from "vitest";
import { collectHostTelemetry } from "./collect.js";
import { createFixtureHostFs } from "./fixture-fs.js";

describe("host telemetry collector", () => {
  it("reads hostname, os, cpu, memory, allowlisted filesystems and temps", async () => {
    const fs = createFixtureHostFs();
    const host = await collectHostTelemetry({
      fs,
      cpuSampleMs: 1,
      sleep: async () => undefined,
    });

    expect(host.hostname).toBe("fixture-host");
    expect(host.os).toContain("Debian");
    expect(host.uptimeSeconds).toBe(12345);
    expect(host.cpu.loadAverage).toEqual([0.5, 0.4, 0.3]);
    expect(host.cpu.usagePercent).toBeGreaterThan(0);
    expect(host.memory.totalBytes).toBe(8048340 * 1024);
    expect(host.memory.availableBytes).toBe(4096000 * 1024);
    expect(host.memory.usedBytes).toBe(
      host.memory.totalBytes - (host.memory.availableBytes ?? 0),
    );

    const mounts = host.filesystems.map((entry) => entry.mountpoint).sort();
    expect(mounts).toEqual(["/", "/boot", "/mnt/data"]);
    expect(mounts).not.toContain("/secret-data");
    expect(mounts).not.toContain("/tmp");

    expect(host.temperatures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "x86_pkg_temp",
          celsius: 45.5,
          source: "thermal",
        }),
        expect.objectContaining({
          name: "coretemp:Package id 0",
          celsius: 52,
          source: "hwmon",
        }),
      ]),
    );
  });
});
