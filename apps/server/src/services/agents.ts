import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import {
  AGENT_MAX_SKEW_MS,
  calculateAgentConnectionStatus,
  type AgentHeartbeatRequest,
  type AgentListResponse,
  type AgentResponse,
  type AgentTelemetry,
  type CreateEnrollmentTokenRequest,
  type EnrollAgentRequest,
  type EnrollAgentResponse,
  type EnrollmentTokenListResponse,
  type EnrollmentTokenResponse,
} from "@rackora/shared";
import { hashToken } from "../config/env.js";
import type { RackoraDatabase } from "../db/client.js";
import {
  agentHeartbeats,
  agentNonces,
  agents,
  agentTelemetryState,
  enrollmentTokens,
} from "../db/schema.js";
import {
  createAgentSecret,
  createEnrollmentTokenValue,
  isTimestampWithinSkew,
  parseAgentTimestamp,
  verifyAgentSignature,
} from "./agent-auth.js";
import { persistAgentTelemetry } from "./agent-telemetry.js";
import type { EncryptionService } from "./encryption.js";
import { deleteSecret, readSecret, storeSecret } from "./secrets.js";

function agentSecretKey(agentId: string): string {
  return `agent.${agentId}.secret`;
}

function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

type AgentRow = {
  id: string;
  name: string;
  status: string;
  lastSeenAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

type TelemetrySummary = {
  collectedAt: Date | null;
  schemaVersion: number | null;
  version: string | null;
  hostname: string | null;
  os: string | null;
  architecture: string | null;
  dockerAvailable: boolean | null;
  dockerEngineVersion: string | null;
  containerCount: number | null;
  cpuUsagePercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
};

function emptyTelemetrySummary(): TelemetrySummary {
  return {
    collectedAt: null,
    schemaVersion: null,
    version: null,
    hostname: null,
    os: null,
    architecture: null,
    dockerAvailable: null,
    dockerEngineVersion: null,
    containerCount: null,
    cpuUsagePercent: null,
    memoryUsedBytes: null,
    memoryTotalBytes: null,
  };
}

function summarizeTelemetryPayload(
  payloadJson: string | null | undefined,
  collectedAt: Date | null,
  schemaVersion: number | null,
): TelemetrySummary {
  const summary = emptyTelemetrySummary();
  summary.collectedAt = collectedAt;
  summary.schemaVersion = schemaVersion;

  if (!payloadJson) {
    return summary;
  }

  try {
    const telemetry = JSON.parse(payloadJson) as AgentTelemetry;
    summary.version = telemetry.agent?.version ?? null;
    summary.hostname = telemetry.host?.hostname ?? null;
    summary.os = telemetry.host?.os ?? null;
    summary.architecture = telemetry.host?.architecture ?? null;
    summary.cpuUsagePercent = telemetry.host?.cpu?.usagePercent ?? null;
    summary.memoryUsedBytes = telemetry.host?.memory?.usedBytes ?? null;
    summary.memoryTotalBytes = telemetry.host?.memory?.totalBytes ?? null;
    summary.dockerAvailable = telemetry.docker?.available ?? null;
    summary.dockerEngineVersion = telemetry.docker?.engine?.version ?? null;
    summary.containerCount =
      telemetry.docker?.containerTotal ??
      telemetry.docker?.containers?.length ??
      null;
  } catch {
    // Keep null telemetry fields when payload is unreadable.
  }

  return summary;
}

function mapAgent(
  row: AgentRow,
  telemetry: TelemetrySummary = emptyTelemetrySummary(),
  nowMs: number = Date.now(),
): AgentResponse {
  const status = calculateAgentConnectionStatus({
    revoked: row.status === "revoked",
    lastHeartbeatAt: row.lastSeenAt,
    nowMs,
  });

  return {
    id: row.id,
    name: row.name,
    status,
    version: telemetry.version,
    hostname: telemetry.hostname,
    os: telemetry.os,
    architecture: telemetry.architecture,
    enrolledAt: row.createdAt.toISOString(),
    lastHeartbeatAt: toIso(row.lastSeenAt),
    revokedAt: toIso(row.revokedAt),
    telemetryReceivedAt: toIso(telemetry.collectedAt),
    dockerAvailable: telemetry.dockerAvailable,
    telemetrySchemaVersion: telemetry.schemaVersion,
    dockerEngineVersion: telemetry.dockerEngineVersion,
    containerCount: telemetry.containerCount,
    cpuUsagePercent: telemetry.cpuUsagePercent,
    memoryUsedBytes: telemetry.memoryUsedBytes,
    memoryTotalBytes: telemetry.memoryTotalBytes,
  };
}

function mapEnrollmentToken(row: {
  id: string;
  name: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}): EnrollmentTokenResponse {
  return {
    id: row.id,
    name: row.name,
    expiresAt: row.expiresAt.toISOString(),
    usedAt: toIso(row.usedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export class AgentServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AgentServiceError";
  }
}

export async function createEnrollmentToken(
  db: RackoraDatabase,
  input: CreateEnrollmentTokenRequest,
): Promise<EnrollmentTokenResponse & { token: string }> {
  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new AgentServiceError(400, "Invalid expiresAt");
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new AgentServiceError(400, "expiresAt must be in the future");
  }

  const token = createEnrollmentTokenValue();
  const now = new Date();
  const id = randomUUID();

  await db.insert(enrollmentTokens).values({
    id,
    name: input.name,
    tokenHash: hashToken(token),
    expiresAt,
    usedAt: null,
    createdAt: now,
  });

  return {
    id,
    name: input.name,
    expiresAt: expiresAt.toISOString(),
    usedAt: null,
    createdAt: now.toISOString(),
    token,
  };
}

export async function listEnrollmentTokens(
  db: RackoraDatabase,
  options: { pendingOnly?: boolean; nowMs?: number } = {},
): Promise<EnrollmentTokenListResponse> {
  const rows = await db
    .select()
    .from(enrollmentTokens)
    .orderBy(desc(enrollmentTokens.createdAt));

  const nowMs = options.nowMs ?? Date.now();
  const tokens = rows
    .map(mapEnrollmentToken)
    .filter((token) => {
      if (!options.pendingOnly) {
        return true;
      }
      if (token.usedAt !== null) {
        return false;
      }
      return Date.parse(token.expiresAt) > nowMs;
    });

  return { tokens };
}

export async function enrollAgent(
  db: RackoraDatabase,
  encryption: EncryptionService,
  input: EnrollAgentRequest,
): Promise<EnrollAgentResponse> {
  const tokenHash = hashToken(input.token);
  const tokenRow = await db.query.enrollmentTokens.findFirst({
    where: eq(enrollmentTokens.tokenHash, tokenHash),
  });

  if (!tokenRow) {
    throw new AgentServiceError(401, "Invalid enrollment token");
  }

  if (tokenRow.usedAt) {
    throw new AgentServiceError(401, "Enrollment token already used");
  }

  if (tokenRow.expiresAt.getTime() <= Date.now()) {
    throw new AgentServiceError(401, "Enrollment token expired");
  }

  const agentId = randomUUID();
  const secret = createAgentSecret();
  const secretKey = agentSecretKey(agentId);
  const now = new Date();

  await storeSecret(db, encryption, secretKey, secret);

  try {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(enrollmentTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(enrollmentTokens.id, tokenRow.id),
            isNull(enrollmentTokens.usedAt),
          ),
        )
        .returning({ id: enrollmentTokens.id });

      if (claimed.length === 0) {
        throw new AgentServiceError(401, "Enrollment token already used");
      }

      await tx.insert(agents).values({
        id: agentId,
        name: input.name,
        secretKey,
        status: "active",
        enrollmentTokenId: tokenRow.id,
        lastSeenAt: null,
        createdAt: now,
        updatedAt: now,
        revokedAt: null,
      });
    });
  } catch (error) {
    await deleteSecret(db, secretKey);
    throw error;
  }

  return {
    agentId,
    secret,
    name: input.name,
  };
}

async function loadTelemetrySummaries(
  db: RackoraDatabase,
  agentIds: string[],
): Promise<Map<string, TelemetrySummary>> {
  const map = new Map<string, TelemetrySummary>();
  if (agentIds.length === 0) {
    return map;
  }

  const rows = await db
    .select()
    .from(agentTelemetryState)
    .where(inArray(agentTelemetryState.agentId, agentIds));

  for (const row of rows) {
    map.set(
      row.agentId,
      summarizeTelemetryPayload(
        row.payloadJson,
        row.collectedAt,
        row.schemaVersion,
      ),
    );
  }

  return map;
}

export async function listAgents(
  db: RackoraDatabase,
  nowMs: number = Date.now(),
): Promise<AgentListResponse> {
  const rows = await db.select().from(agents).orderBy(desc(agents.createdAt));
  const telemetryByAgent = await loadTelemetrySummaries(
    db,
    rows.map((row) => row.id),
  );

  return {
    agents: rows.map((row) =>
      mapAgent(row, telemetryByAgent.get(row.id), nowMs),
    ),
  };
}

export async function getAgent(
  db: RackoraDatabase,
  agentId: string,
  nowMs: number = Date.now(),
): Promise<AgentResponse | null> {
  const row = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });
  if (!row) {
    return null;
  }

  const telemetryByAgent = await loadTelemetrySummaries(db, [agentId]);
  return mapAgent(row, telemetryByAgent.get(agentId), nowMs);
}

export async function revokeAgent(
  db: RackoraDatabase,
  agentId: string,
  nowMs: number = Date.now(),
): Promise<AgentResponse | null> {
  const existing = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });

  if (!existing) {
    return null;
  }

  if (existing.status === "revoked") {
    const telemetryByAgent = await loadTelemetrySummaries(db, [agentId]);
    return mapAgent(existing, telemetryByAgent.get(agentId), nowMs);
  }

  const now = new Date(nowMs);
  await db
    .update(agents)
    .set({
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    })
    .where(eq(agents.id, agentId));

  return getAgent(db, agentId, nowMs);
}

export type AuthenticatedAgent = {
  id: string;
  name: string;
  status: "active";
};

export type AgentAuthResult =
  | { ok: false; status: number; error: string }
  | { ok: true; agent: AuthenticatedAgent };

export async function authenticateAgentRequest(
  db: RackoraDatabase,
  encryption: EncryptionService,
  headers: {
    agentId?: string;
    timestamp?: string;
    nonce?: string;
    signature?: string;
  },
  rawBody: string,
  nowMs: number = Date.now(),
): Promise<AgentAuthResult> {
  const { agentId, timestamp, nonce, signature } = headers;

  if (!agentId || !timestamp || !nonce || !signature) {
    return {
      ok: false,
      status: 401,
      error: "Missing agent authentication headers",
    };
  }

  if (nonce.length < 8 || nonce.length > 128) {
    return { ok: false, status: 401, error: "Invalid nonce" };
  }

  const timestampMs = parseAgentTimestamp(timestamp);
  if (timestampMs === null) {
    return { ok: false, status: 401, error: "Invalid timestamp" };
  }

  if (!isTimestampWithinSkew(timestampMs, nowMs)) {
    return { ok: false, status: 401, error: "Timestamp outside allowed skew" };
  }

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });

  if (!agent) {
    return { ok: false, status: 401, error: "Unknown agent" };
  }

  if (agent.status === "revoked") {
    return { ok: false, status: 401, error: "Agent revoked" };
  }

  const secret = await readSecret(db, encryption, agent.secretKey);
  if (!secret) {
    return { ok: false, status: 401, error: "Agent secret missing" };
  }

  if (!verifyAgentSignature(secret, timestamp, nonce, rawBody, signature)) {
    return { ok: false, status: 401, error: "Invalid signature" };
  }

  const existingNonce = await db.query.agentNonces.findFirst({
    where: and(eq(agentNonces.agentId, agentId), eq(agentNonces.nonce, nonce)),
  });

  if (existingNonce) {
    return { ok: false, status: 401, error: "Nonce already used" };
  }

  try {
    await db.insert(agentNonces).values({
      id: randomUUID(),
      agentId,
      nonce,
      createdAt: new Date(nowMs),
    });
  } catch {
    return { ok: false, status: 401, error: "Nonce already used" };
  }

  await purgeExpiredNonces(db, nowMs);

  return {
    ok: true,
    agent: {
      id: agent.id,
      name: agent.name,
      status: "active",
    },
  };
}

export async function recordHeartbeat(
  db: RackoraDatabase,
  agentId: string,
  body: AgentHeartbeatRequest,
  now: Date = new Date(),
): Promise<{ receivedAt: string }> {
  await db.insert(agentHeartbeats).values({
    id: randomUUID(),
    agentId,
    receivedAt: now,
    status: body.status,
    payloadJson: body.telemetry ? JSON.stringify(body.telemetry) : null,
  });

  await db
    .update(agents)
    .set({
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(agents.id, agentId));

  await persistAgentTelemetry(db, agentId, body, now);

  return { receivedAt: now.toISOString() };
}

export async function purgeExpiredNonces(
  db: RackoraDatabase,
  nowMs: number = Date.now(),
): Promise<void> {
  const cutoff = new Date(nowMs - AGENT_MAX_SKEW_MS * 2);
  await db.delete(agentNonces).where(lt(agentNonces.createdAt, cutoff));
}
