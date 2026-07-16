import { createHmac, randomBytes } from "node:crypto";
import {
  AGENT_MAX_SKEW_MS,
  buildAgentSignaturePayload,
} from "@rackora/shared";
import { safeEqual } from "../config/env.js";

export function createAgentSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function createEnrollmentTokenValue(): string {
  return randomBytes(32).toString("base64url");
}

export function createNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function signAgentPayload(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  const payload = buildAgentSignaturePayload(timestamp, nonce, rawBody);
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyAgentSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = signAgentPayload(secret, timestamp, nonce, rawBody);
  return safeEqual(expected, signature.toLowerCase());
}

export function isTimestampWithinSkew(
  timestampMs: number,
  nowMs: number = Date.now(),
  maxSkewMs: number = AGENT_MAX_SKEW_MS,
): boolean {
  return Math.abs(nowMs - timestampMs) <= maxSkewMs;
}

export function parseAgentTimestamp(
  value: string | undefined,
): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }
  return parsed;
}
