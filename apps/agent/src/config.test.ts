import { describe, expect, it } from "vitest";
import { loadAgentConfig, resolveAgentEnv } from "./config.js";

describe("agent config", () => {
  it("accepts AGENT_DATA_DIR and TELEMETRY_INTERVAL_SECONDS aliases", () => {
    const resolved = resolveAgentEnv({
      CORE_URL: "http://127.0.0.1:7575",
      AGENT_NAME: "host-a",
      AGENT_DATA_DIR: "/data",
      TELEMETRY_INTERVAL_SECONDS: "30",
    });

    expect(resolved.DATA_DIR).toBe("/data");
    expect(resolved.HEARTBEAT_INTERVAL_MS).toBe("30000");

    const config = loadAgentConfig(resolved);
    expect(config.DATA_DIR).toBe("/data");
    expect(config.HEARTBEAT_INTERVAL_MS).toBe(30_000);
  });

  it("prefers DATA_DIR and HEARTBEAT_INTERVAL_MS when both are set", () => {
    const config = loadAgentConfig({
      CORE_URL: "http://127.0.0.1:7575",
      AGENT_NAME: "host-a",
      DATA_DIR: "/var/lib/rackora",
      AGENT_DATA_DIR: "/data",
      HEARTBEAT_INTERVAL_MS: "15000",
      TELEMETRY_INTERVAL_SECONDS: "30",
    });
    expect(config.DATA_DIR).toBe("/var/lib/rackora");
    expect(config.HEARTBEAT_INTERVAL_MS).toBe(15_000);
  });
});
