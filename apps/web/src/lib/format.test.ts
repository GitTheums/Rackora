import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatLatency,
  formatPercent,
  formatRelativeTime,
  formatUptime,
} from "./format";

describe("format helpers", () => {
  it("formats bytes into human units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("formats percentages and latency", () => {
    expect(formatPercent(34)).toBe("34%");
    expect(formatPercent(98.63, 1)).toBe("98.6%");
    expect(formatLatency(14)).toBe("14 ms");
    expect(formatLatency(null)).toBe("—");
  });

  it("formats uptime durations", () => {
    expect(formatUptime(0)).toBe("—");
    expect(formatUptime(3600)).toBe("1h 0m");
    expect(formatUptime(90_000)).toBe("1d 1h");
  });

  it("formats relative time against a fixed reference", () => {
    const now = Date.parse("2026-01-15T12:00:00.000Z");
    expect(
      formatRelativeTime("2026-01-15T11:59:30.000Z", now),
    ).toBe("just now");
    expect(formatRelativeTime("2026-01-15T11:30:00.000Z", now)).toBe(
      "30 min ago",
    );
    expect(formatRelativeTime("2026-01-15T09:00:00.000Z", now)).toBe(
      "3 hr ago",
    );
    expect(formatRelativeTime("2026-01-13T12:00:00.000Z", now)).toBe(
      "2 days ago",
    );
  });
});
