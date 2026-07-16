/**
 * Manual-ish E2E: start core, create enrollment token, run agent once, verify Online, revoke.
 * Usage: pnpm --filter @rackora/server exec tsx scripts/e2e-agent-enroll.ts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "../src/config/env.js";
import { createApp } from "../src/index.js";
import { loadConfig } from "../src/config/env.js";
import { openDatabase } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { EncryptionService } from "../src/services/encryption.js";
import { runAgent } from "../../agent/src/index.js";

const TEST_MASTER_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function extractCookie(
  setCookieHeader: string | string[] | undefined,
  name: string,
): string | undefined {
  if (!setCookieHeader) {
    return undefined;
  }
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const [cookieName, value] = pair?.split("=") ?? [];
    if (cookieName?.trim() === name && value) {
      return value.trim();
    }
  }
  return undefined;
}

function cookieHeader(cookies: Record<string, string | undefined>): string {
  return Object.entries(cookies)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "rackora-e2e-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "rackora-agent-e2e-"));
  const databasePath = path.join(dir, "e2e.db");

  const config = loadConfig({
    NODE_ENV: "test",
    MASTER_ENCRYPTION_KEY: TEST_MASTER_KEY,
    DATABASE_PATH: databasePath,
    COOKIE_SECURE: "false",
    APP_URL: "http://127.0.0.1:0",
    PORT: "0",
    HOST: "127.0.0.1",
    LOG_LEVEL: "silent",
  });

  const { db, close } = await openDatabase(databasePath);
  await runMigrations(db);
  const encryption = new EncryptionService(config.masterEncryptionKey);
  const { app } = await createApp({
    logger: false,
    skipMigrations: true,
    enableScheduler: false,
    deps: { db, config, encryption },
  });

  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server");
  }
  const coreUrl = `http://127.0.0.1:${address.port}`;

  try {
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
    const csrfToken = (me.json() as { csrfToken: string }).csrfToken;
    const authCookie = cookieHeader({
      [SESSION_COOKIE_NAME]: session,
      [CSRF_COOKIE_NAME]: csrf,
    });

    const tokenResponse = await app.inject({
      method: "POST",
      url: "/api/agents/enrollment-tokens",
      headers: {
        "content-type": "application/json",
        cookie: authCookie,
        "x-csrf-token": csrfToken,
      },
      payload: { agentName: "e2e-host", expiresInSeconds: 1800 },
    });
    if (tokenResponse.statusCode !== 201) {
      throw new Error(`Token create failed: ${tokenResponse.body}`);
    }
    const tokenBody = tokenResponse.json() as { token: string };

    await runAgent({
      env: {
        CORE_URL: coreUrl,
        ENROLLMENT_TOKEN: tokenBody.token,
        AGENT_NAME: "e2e-host",
        DATA_DIR: dataDir,
        HEARTBEAT_INTERVAL_MS: "1",
        DOCKER_SOCKET: "",
      },
      sleep: async () => undefined,
      log: () => undefined,
      maxIterations: 1,
    });

    const reuse = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "e2e-host" },
    });
    if (reuse.statusCode !== 401) {
      throw new Error(`Expected one-time token rejection, got ${reuse.statusCode}`);
    }

    const list = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { cookie: authCookie },
    });
    const agents = (list.json() as { agents: Array<{ id: string; status: string; hostname: string | null; version: string | null }> }).agents;
    if (agents.length !== 1) {
      throw new Error(`Expected 1 agent, got ${agents.length}`);
    }
    if (agents[0]?.status !== "online") {
      throw new Error(`Expected online, got ${agents[0]?.status}`);
    }
    if (!agents[0]?.hostname || !agents[0]?.version) {
      throw new Error("Expected hostname and version from telemetry");
    }
    if (JSON.stringify(list.json()).includes(tokenBody.token)) {
      throw new Error("Enrollment token leaked in list response");
    }

    const revoke = await app.inject({
      method: "POST",
      url: `/api/agents/${agents[0]!.id}/revoke`,
      headers: {
        cookie: authCookie,
        "x-csrf-token": csrfToken,
      },
    });
    if (revoke.statusCode !== 200) {
      throw new Error(`Revoke failed: ${revoke.body}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          coreUrl,
          agentStatus: "online-then-revoked",
          hostname: agents[0]?.hostname,
          version: agents[0]?.version,
          tokenReuseRejected: true,
          secretsLeaked: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
    close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
