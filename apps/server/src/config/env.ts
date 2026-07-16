import { createHash, timingSafeEqual } from "node:crypto";
import { getMonorepoRoot } from "./load-env.js";
import { resolveDatabaseFilePath } from "./paths.js";

const KEY_BYTE_LENGTH = 32;

export type ServerConfig = {
  nodeEnv: string;
  port: number;
  host: string;
  appUrl: string;
  logLevel: string;
  databasePath: string;
  masterEncryptionKey: Buffer;
  cookieSecure: boolean;
  sessionTtlMs: number;
  /** Global gate for per-integration insecure TLS. Default false. */
  allowInsecureTls: boolean;
};

export function sanitizeEnvValue(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function parseMasterEncryptionKey(raw: string | undefined): Buffer {
  const sanitized = sanitizeEnvValue(raw);

  if (sanitized === undefined) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY is required. Provide a 32-byte key as 64-character hex or base64.",
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(sanitized)) {
    return Buffer.from(sanitized, "hex");
  }

  const base64 = Buffer.from(sanitized, "base64");
  if (base64.length === KEY_BYTE_LENGTH) {
    return base64;
  }

  throw new Error(
    "MASTER_ENCRYPTION_KEY is invalid. Expected 32 bytes encoded as 64-character hex or base64.",
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const rootDir = getMonorepoRoot();
  const masterEncryptionKey = parseMasterEncryptionKey(
    env.MASTER_ENCRYPTION_KEY,
  );
  const appUrl =
    sanitizeEnvValue(env.APP_URL) ??
    sanitizeEnvValue(env.PUBLIC_URL) ??
    "http://localhost:7575";
  const cookieSecure =
    env.COOKIE_SECURE === "true" ||
    env.TRUST_PROXY === "true" ||
    appUrl.startsWith("https://");

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: Number(env.PORT ?? 7575),
    host: env.HOST ?? "0.0.0.0",
    appUrl,
    logLevel: env.LOG_LEVEL ?? "info",
    databasePath: resolveDatabaseFilePath(env, rootDir),
    masterEncryptionKey,
    cookieSecure,
    sessionTtlMs: Number(env.SESSION_TTL_MS ?? 7 * 24 * 60 * 60 * 1000),
    allowInsecureTls: env.ALLOW_INSECURE_TLS === "true",
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export const SESSION_COOKIE_NAME = "rackora_session";
export const CSRF_COOKIE_NAME = "rackora_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";
