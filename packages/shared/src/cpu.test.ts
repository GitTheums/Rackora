import { describe, expect, it } from "vitest";
import {
  aggregateCpuRatio,
  cpuRatioToPercent,
  formatCpuUsage,
  normalizeCpuRatio,
} from "./cpu.js";

describe("cpuRatioToPercent", () => {
  it("converts a Proxmox ratio to percentage without dividing by 100 again", () => {
    expect(cpuRatioToPercent(0.0064)).toBeCloseTo(0.64);
    expect(cpuRatioToPercent(0.042)).toBeCloseTo(4.2);
    expect(cpuRatioToPercent(0.34)).toBeCloseTo(34);
  });
});

describe("formatCpuUsage", () => {
  it("formats low usage with one decimal place below 10%", () => {
    expect(formatCpuUsage({ ratio: 0.0064 })).toBe("0.6%");
    expect(formatCpuUsage({ ratio: 0.042 })).toBe("4.2%");
    expect(formatCpuUsage({ ratio: 0.34 })).toBe("34%");
  });

  it("shows <0.1% for positive values below 0.1%", () => {
    expect(formatCpuUsage({ ratio: 0.0005 })).toBe("<0.1%");
  });

  it("shows 0% only when the collected value is exactly zero", () => {
    expect(formatCpuUsage({ ratio: 0 })).toBe("0%");
  });

  it("shows Unavailable when CPU data is missing", () => {
    expect(formatCpuUsage({ available: false })).toBe("Unavailable");
    expect(formatCpuUsage({})).toBe("Unavailable");
  });
});

describe("normalizeCpuRatio", () => {
  it("keeps Proxmox ratios between 0 and 1", () => {
    expect(normalizeCpuRatio(0.05)).toBe(0.05);
  });

  it("converts legacy percentage values without double conversion", () => {
    expect(normalizeCpuRatio(5)).toBe(0.05);
    expect(cpuRatioToPercent(normalizeCpuRatio(5)!)).toBeCloseTo(5);
  });
});

describe("aggregateCpuRatio", () => {
  it("computes a weighted average across online nodes", () => {
    const result = aggregateCpuRatio([
      { state: "healthy", cpuRatio: 0.2, cpuCount: 8 },
      { state: "healthy", cpuRatio: 0.4, cpuCount: 16 },
    ]);

    expect(result.available).toBe(true);
    expect(result.cores).toBe(24);
    expect(result.usageRatio).toBeCloseTo((0.2 * 8 + 0.4 * 16) / 24);
  });

  it("excludes offline nodes from current CPU usage", () => {
    const result = aggregateCpuRatio([
      { state: "healthy", cpuRatio: 0.2, cpuCount: 8 },
      { state: "down", cpuRatio: 0.9, cpuCount: 16 },
    ]);

    expect(result.available).toBe(true);
    expect(result.usageRatio).toBeCloseTo(0.2);
    expect(result.cores).toBe(8);
  });

  it("prevents division by zero when no CPU data exists", () => {
    const result = aggregateCpuRatio([
      { state: "healthy", cpuCount: 8 },
      { state: "down", cpuRatio: 0.5, cpuCount: 4 },
    ]);

    expect(result.available).toBe(false);
  });
});
