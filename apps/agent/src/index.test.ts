import { describe, expect, it, vi } from "vitest";
import { formatAgentStatus, getAgentInfo, run } from "./index.js";

describe("rackora-agent", () => {
  it("reports idle status with the shared version", () => {
    const info = getAgentInfo();
    expect(info.name).toBe("rackora-agent");
    expect(info.status).toBe("idle");
    expect(formatAgentStatus(info)).toContain(`v${info.version}`);
  });

  it("logs version and status", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    run();
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/rackora-agent v\d+\.\d+\.\d+ — status: idle/),
    );
    spy.mockRestore();
  });
});
