import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "../config/env.js";
import { openDatabase } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { createApp } from "../index.js";
import { EncryptionService } from "../services/encryption.js";

export const TEST_MASTER_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export async function createTestApp() {
  const dir = mkdtempSync(path.join(tmpdir(), "rackora-test-"));
  const databasePath = path.join(dir, "test.db");
  const config = loadConfig({
    NODE_ENV: "test",
    MASTER_ENCRYPTION_KEY: TEST_MASTER_KEY,
    DATABASE_PATH: databasePath,
    COOKIE_SECURE: "false",
    APP_URL: "http://localhost:7575",
    PORT: "7575",
    HOST: "0.0.0.0",
    LOG_LEVEL: "silent",
  });

  const { db, close } = await openDatabase(databasePath);
  await runMigrations(db);
  const encryption = new EncryptionService(config.masterEncryptionKey);

  const { app } = await createApp({
    logger: false,
    skipMigrations: true,
    enableScheduler: false,
    deps: {
      db,
      config,
      encryption,
    },
  });

  return {
    app,
    db,
    config,
    encryption,
    cleanup: () => {
      close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function extractCookie(
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

export function cookieHeader(
  cookies: Record<string, string | undefined>,
): string {
  return Object.entries(cookies)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}
