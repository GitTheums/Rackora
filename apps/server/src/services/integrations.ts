import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  integrationRecordSchema,
  infrastructureSchema,
  proxmoxPublicConfigSchema,
  type CreateProxmoxIntegration,
  type Infrastructure,
  type IntegrationRecord,
  type ProxmoxConfig,
  type ProxmoxPublicConfig,
  type ServiceState,
  type UpdateProxmoxIntegration,
} from "@rackora/shared";
import type { RackoraDatabase } from "../db/client.js";
import { integrations, snapshots } from "../db/schema.js";
import { ProxmoxAdapter } from "../integrations/proxmox/adapter.js";
import {
  computeNodeHealth,
  getActiveProxmoxIntegrationRow,
  isSnapshotStale,
} from "./proxmox-overview.js";
import type { EncryptionService } from "./encryption.js";
import { deleteSecret, readSecret, storeSecret } from "./secrets.js";

function secretKeyFor(id: string): string {
  return `integration.${id}.tokenSecret`;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseStoredConfig(configJson: string): ProxmoxPublicConfig {
  return proxmoxPublicConfigSchema.parse(JSON.parse(configJson) as unknown);
}

export function toIntegrationRecord(
  row: typeof integrations.$inferSelect,
): IntegrationRecord {
  return integrationRecordSchema.parse({
    id: row.id,
    type: row.type,
    name: row.name,
    enabled: row.enabled,
    config: parseStoredConfig(row.configJson),
    healthStatus: row.healthStatus as ServiceState,
    lastSuccessAt: toIso(row.lastSuccessAt),
    lastErrorAt: toIso(row.lastErrorAt),
    lastError: row.lastError,
    pollIntervalMs: row.pollIntervalMs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    hasSecret: true,
  });
}

export async function listIntegrations(
  db: RackoraDatabase,
): Promise<IntegrationRecord[]> {
  const rows = await db.query.integrations.findMany({
    orderBy: [desc(integrations.createdAt)],
  });
  return rows.map(toIntegrationRecord);
}

export async function getIntegration(
  db: RackoraDatabase,
  id: string,
): Promise<IntegrationRecord | null> {
  const row = await db.query.integrations.findFirst({
    where: eq(integrations.id, id),
  });
  return row ? toIntegrationRecord(row) : null;
}

export async function loadProxmoxConfig(
  db: RackoraDatabase,
  encryption: EncryptionService,
  id: string,
): Promise<{ row: typeof integrations.$inferSelect; config: ProxmoxConfig } | null> {
  const row = await db.query.integrations.findFirst({
    where: eq(integrations.id, id),
  });
  if (!row || row.type !== "proxmox") {
    return null;
  }

  const tokenSecret = await readSecret(db, encryption, row.secretKey);
  if (!tokenSecret) {
    throw new Error("Integration secret is missing");
  }

  const publicConfig = parseStoredConfig(row.configJson);
  return {
    row,
    config: {
      ...publicConfig,
      tokenSecret,
    },
  };
}

export async function createProxmoxIntegration(
  db: RackoraDatabase,
  encryption: EncryptionService,
  input: CreateProxmoxIntegration,
): Promise<IntegrationRecord> {
  const id = randomUUID();
  const now = new Date();
  const secretKey = secretKeyFor(id);
  const { tokenSecret, ...publicConfig } = input.config;

  await storeSecret(db, encryption, secretKey, tokenSecret);

  await db.insert(integrations).values({
    id,
    type: "proxmox",
    name: input.name,
    enabled: input.enabled,
    configJson: JSON.stringify(publicConfig),
    secretKey,
    healthStatus: "unknown",
    pollIntervalMs: input.pollIntervalMs,
    createdAt: now,
    updatedAt: now,
  });

  const record = await getIntegration(db, id);
  if (!record) {
    throw new Error("Failed to create integration");
  }
  return record;
}

export async function updateProxmoxIntegration(
  db: RackoraDatabase,
  encryption: EncryptionService,
  id: string,
  input: UpdateProxmoxIntegration,
): Promise<IntegrationRecord | null> {
  const existing = await db.query.integrations.findFirst({
    where: eq(integrations.id, id),
  });
  if (!existing || existing.type !== "proxmox") {
    return null;
  }

  const currentPublic = parseStoredConfig(existing.configJson);
  const nextPublic: ProxmoxPublicConfig = {
    ...currentPublic,
    ...input.config,
    tlsMode: input.config?.tlsMode ?? currentPublic.tlsMode,
    customCa:
      input.config && "customCa" in input.config
        ? input.config.customCa
        : currentPublic.customCa,
    baseUrl: input.config?.baseUrl ?? currentPublic.baseUrl,
    tokenId: input.config?.tokenId ?? currentPublic.tokenId,
  };

  // Strip accidental secret from public config if present via spread.
  const sanitized = proxmoxPublicConfigSchema.parse(nextPublic);

  if (input.config?.tokenSecret) {
    await storeSecret(db, encryption, existing.secretKey, input.config.tokenSecret);
  }

  const now = new Date();
  await db
    .update(integrations)
    .set({
      name: input.name ?? existing.name,
      enabled: input.enabled ?? existing.enabled,
      pollIntervalMs: input.pollIntervalMs ?? existing.pollIntervalMs,
      configJson: JSON.stringify(sanitized),
      updatedAt: now,
    })
    .where(eq(integrations.id, id));

  return getIntegration(db, id);
}

export async function deleteIntegration(
  db: RackoraDatabase,
  id: string,
): Promise<boolean> {
  const existing = await db.query.integrations.findFirst({
    where: eq(integrations.id, id),
  });
  if (!existing) {
    return false;
  }

  await db.delete(integrations).where(eq(integrations.id, id));
  await deleteSecret(db, existing.secretKey);
  return true;
}

export async function markIntegrationSuccess(
  db: RackoraDatabase,
  id: string,
  payload: Infrastructure,
): Promise<void> {
  const now = new Date();
  let healthStatus = computeNodeHealth(payload.nodes);
  if (payload.partial && healthStatus === "healthy") {
    healthStatus = "degraded";
  }

  await db.insert(snapshots).values({
    id: randomUUID(),
    integrationId: id,
    collectedAt: now,
    status: "success",
    payloadJson: JSON.stringify(payload),
    errorMessage: null,
  });

  await db
    .update(integrations)
    .set({
      healthStatus,
      lastSuccessAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(integrations.id, id));
}

export async function markIntegrationError(
  db: RackoraDatabase,
  id: string,
  message: string,
): Promise<void> {
  const now = new Date();
  await db.insert(snapshots).values({
    id: randomUUID(),
    integrationId: id,
    collectedAt: now,
    status: "error",
    payloadJson: null,
    errorMessage: message,
  });

  await db
    .update(integrations)
    .set({
      healthStatus: "down",
      lastErrorAt: now,
      lastError: message,
      updatedAt: now,
    })
    .where(eq(integrations.id, id));
}

export async function getLatestInfrastructure(
  db: RackoraDatabase,
): Promise<Infrastructure> {
  const proxmox = await getActiveProxmoxIntegrationRow(db);

  if (!proxmox) {
    return infrastructureSchema.parse({
      nodes: [],
      collectedAt: null,
      integrationId: null,
      healthStatus: "unknown",
      lastError: null,
      stale: false,
    });
  }

  const latest = await db.query.snapshots.findFirst({
    where: eq(snapshots.integrationId, proxmox.id),
    orderBy: [desc(snapshots.collectedAt)],
  });

  const stale = isSnapshotStale(latest?.collectedAt, proxmox.pollIntervalMs);
  const integrationName = proxmox.name;

  if (!latest || latest.status !== "success" || !latest.payloadJson) {
    return infrastructureSchema.parse({
      nodes: [],
      collectedAt: toIso(latest?.collectedAt) ?? null,
      integrationId: proxmox.id,
      integrationName,
      healthStatus: proxmox.healthStatus as ServiceState,
      lastError: proxmox.lastError,
      stale,
    });
  }

  const payload = infrastructureSchema.parse(
    JSON.parse(latest.payloadJson) as unknown,
  );

  let healthStatus = computeNodeHealth(payload.nodes);
  if (stale && healthStatus === "healthy") {
    healthStatus = "degraded";
  }
  if (proxmox.healthStatus === "down") {
    healthStatus = "down";
  }

  return infrastructureSchema.parse({
    ...payload,
    collectedAt: latest.collectedAt.toISOString(),
    integrationId: proxmox.id,
    integrationName,
    healthStatus,
    lastError: proxmox.lastError,
    stale,
    partial: payload.partial ?? false,
    warnings: payload.warnings ?? [],
    collectionStatus: payload.collectionStatus,
    clusterStorages: payload.clusterStorages ?? [],
  });
}

export async function pollProxmoxIntegration(
  db: RackoraDatabase,
  encryption: EncryptionService,
  allowInsecureTls: boolean,
  id: string,
): Promise<{ ok: boolean; message: string }> {
  const loaded = await loadProxmoxConfig(db, encryption, id);
  if (!loaded) {
    return { ok: false, message: "Integration not found" };
  }

  const adapter = new ProxmoxAdapter({ allowInsecureTls });

  try {
    const raw = await adapter.collect(loaded.config);
    const normalized = adapter.normalize(raw);
    await markIntegrationSuccess(db, id, normalized);
    return { ok: true, message: "Poll completed" };
  } catch (error) {
    const message = adapter.redactError(error);
    await markIntegrationError(db, id, message);
    return { ok: false, message };
  }
}
