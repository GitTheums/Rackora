import { describe, expect, it } from "vitest";
import {
  agentInfoSchema,
  authMeResponseSchema,
  healthResponseSchema,
  loginRequestSchema,
  RACKORA_VERSION,
  setupRequestSchema,
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

  it("parses auth payloads", () => {
    setupRequestSchema.parse({
      username: "admin",
      password: "secure-pass",
    });
    loginRequestSchema.parse({
      username: "admin",
      password: "secure-pass",
    });
    authMeResponseSchema.parse({
      user: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        username: "admin",
        role: "admin",
      },
      csrfToken: "csrf-token",
    });
  });
});
