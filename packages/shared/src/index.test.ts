import { describe, expect, it } from "vitest";
import {
  agentInfoSchema,
  healthResponseSchema,
  RACKORA_VERSION,
} from "./index.js";

describe("shared schemas", () => {
  it("parses a valid health response", () => {
    const result = healthResponseSchema.parse({
      status: "ok",
      service: "rackora-server",
      version: RACKORA_VERSION,
      timestamp: new Date().toISOString(),
    });

    expect(result.status).toBe("ok");
    expect(result.service).toBe("rackora-server");
  });

  it("parses agent info", () => {
    const result = agentInfoSchema.parse({
      name: "rackora-agent",
      version: RACKORA_VERSION,
      status: "idle",
    });

    expect(result.name).toBe("rackora-agent");
  });
});
