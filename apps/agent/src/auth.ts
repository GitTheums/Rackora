import { createHmac, randomBytes } from "node:crypto";
import { buildAgentSignaturePayload } from "@rackora/shared";

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

export function buildSignedHeaders(options: {
  agentId: string;
  secret: string;
  rawBody: string;
  timestampMs?: number;
  nonce?: string;
}): {
  timestamp: string;
  nonce: string;
  signature: string;
  headers: Record<string, string>;
} {
  const timestamp = String(options.timestampMs ?? Date.now());
  const nonce = options.nonce ?? createNonce();
  const signature = signAgentPayload(
    options.secret,
    timestamp,
    nonce,
    options.rawBody,
  );

  return {
    timestamp,
    nonce,
    signature,
    headers: {
      "x-rackora-agent-id": options.agentId,
      "x-rackora-timestamp": timestamp,
      "x-rackora-nonce": nonce,
      "x-rackora-signature": signature,
    },
  };
}
