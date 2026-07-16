import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  cookieHeader,
  createTestApp,
  extractCookie,
} from "../../test/helpers.js";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "../../config/env.js";
import { integrations } from "../../db/schema.js";
import { readSecret } from "../../services/secrets.js";
import type * as HttpModule from "../http.js";
import { createSuccessFetchMock } from "./fixtures.js";

const mockFetch = createSuccessFetchMock();

vi.mock("../http.js", async (importOriginal) => {
  const actual = await importOriginal<typeof HttpModule>();
  return {
    ...actual,
    safeFetch: vi.fn(async (url: string, options: { headers?: Record<string, string> }) => {
      // Ensure Authorization is present but never returned to callers of tests via logs.
      expect(options.headers?.Authorization).toMatch(/^PVEAPIToken=/);
      expect(options.headers?.Authorization).not.toContain("undefined");
      return mockFetch(url, options as RequestInit);
    }),
  };
});

async function authenticate(app: Awaited<ReturnType<typeof createTestApp>>["app"]) {
  const status = await app.inject({ method: "GET", url: "/api/setup/status" });
  const csrf = extractCookie(status.headers["set-cookie"], CSRF_COOKIE_NAME);
  const setup = await app.inject({
    method: "POST",
    url: "/api/setup",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader({ [CSRF_COOKIE_NAME]: csrf }),
      "x-csrf-token": csrf ?? "",
    },
    payload: { username: "admin", password: "password123" },
  });

  const session = extractCookie(setup.headers["set-cookie"], SESSION_COOKIE_NAME);
  const me = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: cookieHeader({ [SESSION_COOKIE_NAME]: session }) },
  });
  const body = me.json() as { csrfToken: string };

  return {
    cookie: cookieHeader({
      [SESSION_COOKIE_NAME]: session,
      [CSRF_COOKIE_NAME]: csrf,
    }),
    csrfToken: body.csrfToken,
  };
}

describe("Proxmox integration API", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("saves an integration with encrypted secret and exposes infrastructure", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app, db, encryption } = testApp;
    const auth = await authenticate(app);

    const create = await app.inject({
      method: "POST",
      url: "/api/integrations/proxmox",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: {
        name: "Home Proxmox",
        enabled: true,
        pollIntervalMs: 60_000,
        config: {
          baseUrl: "https://192.168.5.10:8006",
          tokenId: "root@pam!rackora",
          tokenSecret: "super-secret-token-value",
          tlsMode: "verify",
        },
      },
    });

    expect(create.statusCode).toBe(201);
    const created = create.json() as {
      integration: { id: string; config: { baseUrl: string } };
    };
    expect(created.integration.config.baseUrl).toBe(
      "https://192.168.5.10:8006",
    );
    expect(JSON.stringify(created)).not.toContain("super-secret-token-value");

    const row = await db.query.integrations.findFirst({
      where: eq(integrations.id, created.integration.id),
    });
    expect(row).toBeTruthy();
    expect(row?.configJson).not.toContain("super-secret-token-value");

    const secret = await readSecret(db, encryption, row!.secretKey);
    expect(secret).toBe("super-secret-token-value");

    const secrets = await db.query.encryptedSecrets.findMany();
    expect(secrets.length).toBeGreaterThan(0);
    expect(secrets[0]?.ciphertext).not.toContain("super-secret-token-value");

    // Manual poll to ensure snapshot is written (create already kicked one).
    const poll = await app.inject({
      method: "POST",
      url: `/api/integrations/${created.integration.id}/poll`,
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
    });
    expect(poll.statusCode).toBe(200);

    const infra = await app.inject({
      method: "GET",
      url: "/api/infrastructure",
      headers: { cookie: auth.cookie },
    });
    expect(infra.statusCode).toBe(200);
    const body = infra.json() as { nodes: Array<{ name: string }> };
    expect(body.nodes.map((node) => node.name).sort()).toEqual(["pve1", "pve2"]);

    const overview = await app.inject({
      method: "GET",
      url: "/api/overview",
      headers: { cookie: auth.cookie },
    });
    expect(overview.statusCode).toBe(200);
    const overviewBody = overview.json() as {
      proxmox: { connected: boolean; summary?: { nodesTotal: number } };
    };
    expect(overviewBody.proxmox.connected).toBe(true);
    expect(overviewBody.proxmox.summary?.nodesTotal).toBe(2);
    expect(JSON.stringify(overviewBody)).not.toContain("super-secret-token-value");
    expect(JSON.stringify(overviewBody)).not.toContain("PVEAPIToken");
  });
});
