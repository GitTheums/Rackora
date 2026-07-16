import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_ID_HEADER,
  AGENT_MAX_SKEW_MS,
  AGENT_NONCE_HEADER,
  AGENT_SIGNATURE_HEADER,
  AGENT_TIMESTAMP_HEADER,
} from "@rackora/shared";
import { eq } from "drizzle-orm";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "./config/env.js";
import { enrollmentTokens } from "./db/schema.js";
import { signAgentPayload } from "./services/agent-auth.js";
import {
  cookieHeader,
  createTestApp,
  extractCookie,
} from "./test/helpers.js";

async function authenticate(
  app: Awaited<ReturnType<typeof createTestApp>>["app"],
) {
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

  const session = extractCookie(
    setup.headers["set-cookie"],
    SESSION_COOKIE_NAME,
  );
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

async function createToken(
  app: Awaited<ReturnType<typeof createTestApp>>["app"],
  auth: Awaited<ReturnType<typeof authenticate>>,
  expiresAt: Date,
  name = "host-a",
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/agents/enrollment-tokens",
    headers: {
      "content-type": "application/json",
      cookie: auth.cookie,
      "x-csrf-token": auth.csrfToken,
    },
    payload: {
      name,
      expiresAt: expiresAt.toISOString(),
    },
  });
  return response;
}

function signedHeartbeat(options: {
  agentId: string;
  secret: string;
  status?: string;
  timestampMs?: number;
  nonce?: string;
  mutateBody?: (body: string) => string;
  mutateSignature?: (signature: string) => string;
}) {
  const bodyObject = { status: options.status ?? "ok" };
  let rawBody = JSON.stringify(bodyObject);
  if (options.mutateBody) {
    rawBody = options.mutateBody(rawBody);
  }
  const timestamp = String(options.timestampMs ?? Date.now());
  const nonce = options.nonce ?? `nonce-${Math.random().toString(16).slice(2)}`;
  let signature = signAgentPayload(
    options.secret,
    timestamp,
    nonce,
    rawBody,
  );
  if (options.mutateSignature) {
    signature = options.mutateSignature(signature);
  }

  return {
    rawBody,
    headers: {
      "content-type": "application/json",
      [AGENT_ID_HEADER]: options.agentId,
      [AGENT_TIMESTAMP_HEADER]: timestamp,
      [AGENT_NONCE_HEADER]: nonce,
      [AGENT_SIGNATURE_HEADER]: signature,
    },
  };
}

describe("agent enrollment and authentication", () => {
  let cleanup: (() => void) | undefined;

  afterEach(async () => {
    cleanup?.();
    cleanup = undefined;
  });

  it("enrolls with a one-time token and accepts a signed heartbeat", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app } = testApp;
    const auth = await authenticate(app);

    const tokenResponse = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
    );
    expect(tokenResponse.statusCode).toBe(201);
    const tokenBody = tokenResponse.json() as { token: string; name: string };
    expect(tokenBody.token).toBeTruthy();

    const enroll = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-a" },
    });
    expect(enroll.statusCode).toBe(201);
    const enrolled = enroll.json() as {
      agentId: string;
      secret: string;
      name: string;
    };
    expect(enrolled.name).toBe("host-a");
    expect(enrolled.secret.length).toBeGreaterThan(20);

    const signed = signedHeartbeat({
      agentId: enrolled.agentId,
      secret: enrolled.secret,
    });
    const heartbeat = await app.inject({
      method: "POST",
      url: "/api/agents/heartbeat",
      headers: signed.headers,
      payload: signed.rawBody,
    });
    expect(heartbeat.statusCode).toBe(200);
    expect(heartbeat.json()).toMatchObject({ ok: true });

    const list = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { cookie: auth.cookie },
    });
    expect(list.statusCode).toBe(200);
    const agents = (
      list.json() as {
        agents: Array<Record<string, unknown>>;
      }
    ).agents;
    expect(agents).toHaveLength(1);
    expect(agents[0]?.status).toBe("online");
    expect(agents[0]).not.toHaveProperty("secret");
    expect(JSON.stringify(agents)).not.toContain(enrolled.secret);
    expect(JSON.stringify(agents)).not.toContain(tokenBody.token);

    const detail = await app.inject({
      method: "GET",
      url: `/api/agents/${enrolled.agentId}`,
      headers: { cookie: auth.cookie },
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json() as { agent: Record<string, unknown> };
    expect(detailBody.agent.status).toBe("online");
    expect(detailBody.agent).not.toHaveProperty("secret");
    expect(JSON.stringify(detailBody)).not.toContain(enrolled.secret);

    await app.close();
  });

  it("rejects unauthenticated agent list and stores enrollment tokens hashed only", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app, db } = testApp;

    const unauth = await app.inject({ method: "GET", url: "/api/agents" });
    expect(unauth.statusCode).toBe(401);

    const auth = await authenticate(app);
    const tokenResponse = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
      "hashed-check",
    );
    expect(tokenResponse.statusCode).toBe(201);
    const tokenBody = tokenResponse.json() as { token: string; id: string };
    expect(tokenBody.token).toBeTruthy();

    const listed = await app.inject({
      method: "GET",
      url: "/api/agents/enrollment-tokens",
      headers: { cookie: auth.cookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(JSON.stringify(listed.json())).not.toContain(tokenBody.token);

    const { enrollmentTokens } = await import("./db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { hashToken } = await import("./config/env.js");
    const row = await db.query.enrollmentTokens.findFirst({
      where: eq(enrollmentTokens.id, tokenBody.id),
    });
    expect(row?.tokenHash).toBe(hashToken(tokenBody.token));
    expect(row?.tokenHash).not.toBe(tokenBody.token);

    await app.close();
  });

  it("accepts expiresInSeconds and agentName when creating a token", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app } = testApp;
    const auth = await authenticate(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agents/enrollment-tokens",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: {
        agentName: "compose-host",
        expiresInSeconds: 1800,
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { name: string; token: string };
    expect(body.name).toBe("compose-host");
    expect(body.token.length).toBeGreaterThan(20);

    await app.close();
  });

  it("rejects an expired enrollment token", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app, db } = testApp;
    const auth = await authenticate(app);

    const tokenResponse = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
    );
    const tokenBody = tokenResponse.json() as { token: string; id: string };

    await db
      .update(enrollmentTokens)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(enrollmentTokens.id, tokenBody.id));

    const enroll = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-a" },
    });
    expect(enroll.statusCode).toBe(401);
    expect(enroll.json()).toMatchObject({ error: "Enrollment token expired" });

    await app.close();
  });

  it("rejects a second use of the same enrollment token", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app } = testApp;
    const auth = await authenticate(app);

    const tokenResponse = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
    );
    const tokenBody = tokenResponse.json() as { token: string };

    const first = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-a" },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-b" },
    });
    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({
      error: "Enrollment token already used",
    });

    await app.close();
  });

  it("rejects a heartbeat with an invalid signature", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app } = testApp;
    const auth = await authenticate(app);

    const tokenResponse = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
    );
    const tokenBody = tokenResponse.json() as { token: string };
    const enroll = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-a" },
    });
    const enrolled = enroll.json() as { agentId: string; secret: string };

    const signed = signedHeartbeat({
      agentId: enrolled.agentId,
      secret: enrolled.secret,
      mutateSignature: (signature) =>
        `${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`,
    });
    const heartbeat = await app.inject({
      method: "POST",
      url: "/api/agents/heartbeat",
      headers: signed.headers,
      payload: signed.rawBody,
    });
    expect(heartbeat.statusCode).toBe(401);
    expect(heartbeat.json()).toMatchObject({ error: "Invalid signature" });

    await app.close();
  });

  it("rejects replayed nonces", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app } = testApp;
    const auth = await authenticate(app);

    const tokenResponse = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
    );
    const tokenBody = tokenResponse.json() as { token: string };
    const enroll = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-a" },
    });
    const enrolled = enroll.json() as { agentId: string; secret: string };

    const signed = signedHeartbeat({
      agentId: enrolled.agentId,
      secret: enrolled.secret,
      nonce: "fixed-nonce-value-1",
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/agents/heartbeat",
      headers: signed.headers,
      payload: signed.rawBody,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/agents/heartbeat",
      headers: signed.headers,
      payload: signed.rawBody,
    });
    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ error: "Nonce already used" });

    await app.close();
  });

  it("rejects timestamps outside the allowed clock skew", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app } = testApp;
    const auth = await authenticate(app);

    const tokenResponse = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
    );
    const tokenBody = tokenResponse.json() as { token: string };
    const enroll = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-a" },
    });
    const enrolled = enroll.json() as { agentId: string; secret: string };

    const signed = signedHeartbeat({
      agentId: enrolled.agentId,
      secret: enrolled.secret,
      timestampMs: Date.now() - (AGENT_MAX_SKEW_MS + 5_000),
    });
    const heartbeat = await app.inject({
      method: "POST",
      url: "/api/agents/heartbeat",
      headers: signed.headers,
      payload: signed.rawBody,
    });
    expect(heartbeat.statusCode).toBe(401);
    expect(heartbeat.json()).toMatchObject({
      error: "Timestamp outside allowed skew",
    });

    await app.close();
  });

  it("rejects heartbeats from a revoked agent", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app } = testApp;
    const auth = await authenticate(app);

    const tokenResponse = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
    );
    const tokenBody = tokenResponse.json() as { token: string };
    const enroll = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-a" },
    });
    const enrolled = enroll.json() as { agentId: string; secret: string };

    const revoke = await app.inject({
      method: "POST",
      url: `/api/agents/${enrolled.agentId}/revoke`,
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json()).toMatchObject({ status: "revoked" });
    expect(JSON.stringify(revoke.json())).not.toContain(enrolled.secret);

    const signed = signedHeartbeat({
      agentId: enrolled.agentId,
      secret: enrolled.secret,
    });
    const heartbeat = await app.inject({
      method: "POST",
      url: "/api/agents/heartbeat",
      headers: signed.headers,
      payload: signed.rawBody,
    });
    expect(heartbeat.statusCode).toBe(401);
    expect(heartbeat.json()).toMatchObject({ error: "Agent revoked" });

    await app.close();
  });

  it("lists unused unexpired tokens as pending and hides consumed or expired ones", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app, db } = testApp;
    const auth = await authenticate(app);

    const pending = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
      "pending-host",
    );
    expect(pending.statusCode).toBe(201);
    const pendingBody = pending.json() as { id: string; token: string };

    const toConsume = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
      "consumed-host",
    );
    const consumedBody = toConsume.json() as { id: string; token: string };
    const enroll = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: consumedBody.token, name: "consumed-host" },
    });
    expect(enroll.statusCode).toBe(201);

    const expired = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
      "expired-host",
    );
    const expiredBody = expired.json() as { id: string };
    await db
      .update(enrollmentTokens)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(enrollmentTokens.id, expiredBody.id));

    const pendingList = await app.inject({
      method: "GET",
      url: "/api/agents/enrollment-tokens?status=pending",
      headers: { cookie: auth.cookie },
    });
    expect(pendingList.statusCode).toBe(200);
    const pendingTokens = (
      pendingList.json() as { tokens: Array<{ id: string; name: string }> }
    ).tokens;
    expect(pendingTokens.map((token) => token.id)).toEqual([pendingBody.id]);
    expect(pendingTokens.every((token) => token.name === "pending-host")).toBe(
      true,
    );
    expect(JSON.stringify(pendingList.json())).not.toContain(pendingBody.token);
    expect(JSON.stringify(pendingList.json())).not.toContain(
      consumedBody.token,
    );

    const allList = await app.inject({
      method: "GET",
      url: "/api/agents/enrollment-tokens",
      headers: { cookie: auth.cookie },
    });
    const allTokens = (
      allList.json() as {
        tokens: Array<{ id: string; usedAt: string | null }>;
      }
    ).tokens;
    expect(allTokens.length).toBeGreaterThanOrEqual(3);
    expect(allTokens.find((token) => token.id === consumedBody.id)?.usedAt).toBeTruthy();

    await app.close();
  });

  it("derives Online, Degraded, Offline, and Revoked from heartbeat freshness", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app, db } = testApp;
    const auth = await authenticate(app);

    async function enrollNamed(name: string) {
      const tokenResponse = await createToken(
        app,
        auth,
        new Date(Date.now() + 60_000),
        name,
      );
      const tokenBody = tokenResponse.json() as { token: string };
      const enroll = await app.inject({
        method: "POST",
        url: "/api/agents/enroll",
        headers: { "content-type": "application/json" },
        payload: { token: tokenBody.token, name },
      });
      expect(enroll.statusCode).toBe(201);
      return enroll.json() as { agentId: string; secret: string };
    }

    const online = await enrollNamed("online-host");
    const degraded = await enrollNamed("degraded-host");
    const offline = await enrollNamed("offline-host");
    const revoked = await enrollNamed("revoked-host");

    const signed = signedHeartbeat({
      agentId: online.agentId,
      secret: online.secret,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/agents/heartbeat",
          headers: signed.headers,
          payload: signed.rawBody,
        })
      ).statusCode,
    ).toBe(200);

    const { agents } = await import("./db/schema.js");
    await db
      .update(agents)
      .set({ lastSeenAt: new Date(Date.now() - 120_000) })
      .where(eq(agents.id, degraded.agentId));
    await db
      .update(agents)
      .set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(agents.id, offline.agentId));

    const revoke = await app.inject({
      method: "POST",
      url: `/api/agents/${revoked.agentId}/revoke`,
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
    });
    expect(revoke.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { cookie: auth.cookie },
    });
    expect(list.statusCode).toBe(200);
    const listed = (
      list.json() as {
        agents: Array<{ name: string; status: string }>;
      }
    ).agents;
    const byName = Object.fromEntries(
      listed.map((agent) => [agent.name, agent.status]),
    );
    expect(byName["online-host"]).toBe("online");
    expect(byName["degraded-host"]).toBe("degraded");
    expect(byName["offline-host"]).toBe("offline");
    expect(byName["revoked-host"]).toBe("revoked");

    const serialized = JSON.stringify(list.json());
    expect(serialized).not.toContain(online.secret);
    expect(serialized).not.toMatch(/agentSecret|enrollmentToken|tokenHash|hmac/i);

    // Same pending token name must not be confused with the enrolled agent.
    const extraPending = await createToken(
      app,
      auth,
      new Date(Date.now() + 60_000),
      "online-host",
    );
    expect(extraPending.statusCode).toBe(201);
    const pendingOnly = await app.inject({
      method: "GET",
      url: "/api/agents/enrollment-tokens?status=pending",
      headers: { cookie: auth.cookie },
    });
    const pendingTokens = (
      pendingOnly.json() as { tokens: Array<{ name: string }> }
    ).tokens;
    expect(pendingTokens.some((token) => token.name === "online-host")).toBe(
      true,
    );
    expect(
      listed.find((agent) => agent.name === "online-host")?.status,
    ).toBe("online");

    await app.close();
  });
});
