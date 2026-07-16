import { describe, expect, it } from "vitest";
import {
  agentInfoSchema,
  authMeResponseSchema,
  checksSchema,
  createEnrollmentTokenRequestSchema,
  dockerSchema,
  healthResponseSchema,
  infrastructureSchema,
  integrationsSchema,
  loginRequestSchema,
  mockChecks,
  mockDocker,
  mockInfrastructure,
  mockIntegrations,
  mockOverview,
  mockUpdates,
  overviewSchema,
  proxmoxConfigSchema,
  RACKORA_VERSION,
  setupRequestSchema,
  updatesSchema,
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

  it("validates dashboard mock data against its schemas", () => {
    expect(() => overviewSchema.parse(mockOverview)).not.toThrow();
    expect(() => infrastructureSchema.parse(mockInfrastructure)).not.toThrow();
    expect(() => dockerSchema.parse(mockDocker)).not.toThrow();
    expect(() => checksSchema.parse(mockChecks)).not.toThrow();
    expect(() => updatesSchema.parse(mockUpdates)).not.toThrow();
    expect(() => integrationsSchema.parse(mockIntegrations)).not.toThrow();
  });

  it("accepts enrollment token creation with agentName and expiresInSeconds", () => {
    const result = createEnrollmentTokenRequestSchema.parse({
      agentName: "host-a",
      expiresInSeconds: 1800,
    });
    expect(result.name).toBe("host-a");
    expect(result.expiresAt).toMatch(/^\d{4}-/);
  });

  it("parses a Proxmox API token config", () => {
    const result = proxmoxConfigSchema.parse({
      baseUrl: "https://192.168.1.10:8006",
      tokenId: "root@pam!rackora",
      tokenSecret: "secret-value",
      tlsMode: "verify",
    });
    expect(result.tokenId).toBe("root@pam!rackora");
    expect(() =>
      proxmoxConfigSchema.parse({
        baseUrl: "https://192.168.1.10:8006",
        tokenId: "invalid",
        tokenSecret: "secret-value",
      }),
    ).toThrow();
  });
});
