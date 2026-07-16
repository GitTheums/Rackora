import { z } from "zod";
import {
  AGENT_HEARTBEAT_INTERVAL_MS,
  agentTelemetrySchema,
} from "./telemetry.js";

export const AGENT_ID_HEADER = "x-rackora-agent-id";
export const AGENT_TIMESTAMP_HEADER = "x-rackora-timestamp";
export const AGENT_NONCE_HEADER = "x-rackora-nonce";
export const AGENT_SIGNATURE_HEADER = "x-rackora-signature";

/** Maximum allowed clock skew between agent and core (5 minutes). */
export const AGENT_MAX_SKEW_MS = 5 * 60 * 1000;

/** Heartbeat within this window → Online (3× default interval). */
export const AGENT_ONLINE_THRESHOLD_MS = AGENT_HEARTBEAT_INTERVAL_MS * 3;

/** Heartbeat within this window but past online → Degraded (6× interval). */
export const AGENT_DEGRADED_THRESHOLD_MS = AGENT_HEARTBEAT_INTERVAL_MS * 6;

export const agentRecordStatusSchema = z.enum(["active", "revoked"]);

export type AgentRecordStatus = z.infer<typeof agentRecordStatusSchema>;

export const agentConnectionStatusSchema = z.enum([
  "online",
  "degraded",
  "offline",
  "revoked",
  "pending",
]);

export type AgentConnectionStatus = z.infer<typeof agentConnectionStatusSchema>;

const agentNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

export const createEnrollmentTokenRequestSchema = z
  .object({
    /** Preferred field for the intended agent name. */
    agentName: agentNameSchema.optional(),
    /** Backward-compatible alias for agentName. */
    name: agentNameSchema.optional(),
    expiresAt: z.string().datetime().optional(),
    expiresInSeconds: z.number().int().positive().max(7 * 24 * 60 * 60).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.agentName && !value.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agentName is required",
        path: ["agentName"],
      });
    }
    if (!value.expiresAt && value.expiresInSeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expiresAt or expiresInSeconds is required",
        path: ["expiresInSeconds"],
      });
    }
  })
  .transform((value) => {
    const name = (value.agentName ?? value.name)!;
    const expiresAt =
      value.expiresAt ??
      new Date(Date.now() + (value.expiresInSeconds ?? 0) * 1000).toISOString();
    return {
      name,
      agentName: name,
      expiresAt,
      expiresInSeconds: value.expiresInSeconds,
    };
  });

/** Parsed/normalized enrollment token create payload. */
export type CreateEnrollmentTokenRequest = z.output<
  typeof createEnrollmentTokenRequestSchema
>;

/** Client input before Zod normalization. */
export type CreateEnrollmentTokenInput = z.input<
  typeof createEnrollmentTokenRequestSchema
>;

export const enrollmentTokenResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  expiresAt: z.string().datetime(),
  usedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  /** Plaintext token — only present on create. */
  token: z.string().min(1).optional(),
});

export type EnrollmentTokenResponse = z.infer<
  typeof enrollmentTokenResponseSchema
>;

export const enrollmentTokenListResponseSchema = z.object({
  tokens: z.array(enrollmentTokenResponseSchema),
});

export type EnrollmentTokenListResponse = z.infer<
  typeof enrollmentTokenListResponseSchema
>;

export const enrollAgentRequestSchema = z.object({
  token: z.string().min(1).max(512),
  name: agentNameSchema,
});

export type EnrollAgentRequest = z.infer<typeof enrollAgentRequestSchema>;

export const enrollAgentResponseSchema = z.object({
  agentId: z.string().uuid(),
  secret: z.string().min(1),
  name: z.string().min(1),
});

export type EnrollAgentResponse = z.infer<typeof enrollAgentResponseSchema>;

export const agentResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  status: agentConnectionStatusSchema,
  version: z.string().nullable(),
  hostname: z.string().nullable(),
  os: z.string().nullable(),
  architecture: z.string().nullable(),
  enrolledAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  telemetryReceivedAt: z.string().datetime().nullable(),
  dockerAvailable: z.boolean().nullable(),
  telemetrySchemaVersion: z.number().int().positive().nullable(),
  dockerEngineVersion: z.string().nullable(),
  containerCount: z.number().int().nonnegative().nullable(),
  cpuUsagePercent: z.number().nullable(),
  memoryUsedBytes: z.number().nullable(),
  memoryTotalBytes: z.number().nullable(),
});

export type AgentResponse = z.infer<typeof agentResponseSchema>;

export const agentListResponseSchema = z.object({
  agents: z.array(agentResponseSchema),
});

export type AgentListResponse = z.infer<typeof agentListResponseSchema>;

export const agentDetailResponseSchema = z.object({
  agent: agentResponseSchema,
});

export type AgentDetailResponse = z.infer<typeof agentDetailResponseSchema>;

export const agentHeartbeatRequestSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]).default("ok"),
  telemetry: agentTelemetrySchema.optional(),
});

export type AgentHeartbeatRequest = z.infer<typeof agentHeartbeatRequestSchema>;

export const agentHeartbeatResponseSchema = z.object({
  ok: z.literal(true),
  receivedAt: z.string().datetime(),
});

export type AgentHeartbeatResponse = z.infer<
  typeof agentHeartbeatResponseSchema
>;

/**
 * Derive connection status from revocation and heartbeat freshness.
 * Never marks an agent Online based only on the DB active flag.
 */
export function calculateAgentConnectionStatus(options: {
  revoked: boolean;
  lastHeartbeatAt: Date | string | null | undefined;
  nowMs?: number;
  onlineThresholdMs?: number;
  degradedThresholdMs?: number;
}): AgentConnectionStatus {
  if (options.revoked) {
    return "revoked";
  }

  const lastHeartbeatAt = options.lastHeartbeatAt
    ? new Date(options.lastHeartbeatAt).getTime()
    : null;

  if (lastHeartbeatAt === null || Number.isNaN(lastHeartbeatAt)) {
    return "offline";
  }

  const nowMs = options.nowMs ?? Date.now();
  const ageMs = nowMs - lastHeartbeatAt;
  const onlineThreshold =
    options.onlineThresholdMs ?? AGENT_ONLINE_THRESHOLD_MS;
  const degradedThreshold =
    options.degradedThresholdMs ?? AGENT_DEGRADED_THRESHOLD_MS;

  if (ageMs <= onlineThreshold) {
    return "online";
  }
  if (ageMs <= degradedThreshold) {
    return "degraded";
  }
  return "offline";
}

/**
 * Canonical string signed by HMAC-SHA256 for agent requests.
 * Format: `${timestamp}.${nonce}.${rawBody}`
 */
export function buildAgentSignaturePayload(
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  return `${timestamp}.${nonce}.${rawBody}`;
}
