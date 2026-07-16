import { and, desc, eq } from "drizzle-orm";
import {
  aggregateCpuRatio,
  cpuRatioToPercent,
  dashboardOverviewSchema,
  type DashboardOverview,
  type Infrastructure,
  type Node,
  type ProxmoxOverview,
  type ServiceState,
  type StoragePool,
  type SyncEvent,
} from "@rackora/shared";
import type { RackoraDatabase } from "../db/client.js";
import { integrations, snapshots } from "../db/schema.js";
import { toIntegrationRecord } from "./integrations.js";

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function isNodeOnline(node: Node): boolean {
  return node.state !== "down";
}

/** Compute integration health from normalized node states (stopped VMs are ignored). */
export function computeNodeHealth(nodes: Node[]): ServiceState {
  if (nodes.length === 0) {
    return "unknown";
  }
  const offline = nodes.filter((node) => node.state === "down").length;
  if (offline === nodes.length) {
    return "down";
  }
  if (offline > 0) {
    return "degraded";
  }
  return "healthy";
}

/** Deduplicate shared storage pools reported by multiple nodes. */
export function dedupeStoragePools(nodes: Node[], clusterStorages: StoragePool[] = []): StoragePool[] {
  const byName = new Map<string, StoragePool[]>();

  for (const node of nodes) {
    for (const storage of node.storages) {
      const list = byName.get(storage.name) ?? [];
      list.push(storage);
      byName.set(storage.name, list);
    }
  }

  for (const storage of clusterStorages) {
    const list = byName.get(storage.name) ?? [];
    list.push(storage);
    byName.set(storage.name, list);
  }

  const result: StoragePool[] = [];
  for (const pools of byName.values()) {
    if (pools.length === 1) {
      result.push(pools[0]!);
      continue;
    }

    const first = pools[0]!;
    const allSame = pools.every(
      (pool) =>
        pool.totalBytes === first.totalBytes &&
        pool.usedBytes === first.usedBytes,
    );

    if (allSame) {
      result.push(first);
    } else {
      result.push(...pools);
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function aggregateWorkloads(nodes: Node[]) {
  let qemuTotal = 0;
  let lxcTotal = 0;
  let workloadsRunning = 0;
  let workloadsStopped = 0;

  for (const node of nodes) {
    for (const guest of node.guests) {
      if (guest.kind === "qemu") {
        qemuTotal += 1;
      } else {
        lxcTotal += 1;
      }

      if (guest.state === "healthy") {
        workloadsRunning += 1;
      } else if (guest.state === "down") {
        workloadsStopped += 1;
      }
    }
  }

  const nodesOnline = nodes.filter(isNodeOnline).length;
  const nodesOffline = nodes.length - nodesOnline;

  return {
    nodesTotal: nodes.length,
    nodesOnline,
    nodesOffline,
    qemuTotal,
    lxcTotal,
    workloadsRunning,
    workloadsStopped,
  };
}

export function aggregateCpu(nodes: Node[]) {
  const online = nodes.filter(isNodeOnline);
  const result = aggregateCpuRatio(online);

  return {
    usageRatio: result.available ? result.usageRatio : undefined,
    usagePercent: result.available
      ? cpuRatioToPercent(result.usageRatio)
      : 0,
    cores: result.cores,
    available: result.available,
    historyAvailable: false,
    history: [] as { t: string; value: number }[],
  };
}

export function aggregateMemory(nodes: Node[]) {
  const online = nodes.filter(isNodeOnline);
  let usedBytes = 0;
  let totalBytes = 0;
  let hasBytes = false;

  for (const node of online) {
    if (node.memoryBytes !== undefined && node.maxMemoryBytes !== undefined) {
      usedBytes += node.memoryBytes;
      totalBytes += node.maxMemoryBytes;
      hasBytes = true;
    }
  }

  const usagePercent =
    totalBytes > 0 ? clampPercent((usedBytes / totalBytes) * 100) : 0;

  return {
    usedBytes,
    totalBytes: totalBytes > 0 ? totalBytes : 0,
    usagePercent,
    available: hasBytes,
    historyAvailable: false,
    history: [] as { t: string; value: number }[],
  };
}

export function aggregateStorage(nodes: Node[], clusterStorages: StoragePool[] = []) {
  const pools = dedupeStoragePools(nodes, clusterStorages);
  let usedBytes = 0;
  let totalBytes = 0;

  for (const pool of pools) {
    usedBytes += pool.usedBytes;
    totalBytes += pool.totalBytes;
  }

  const usagePercent =
    totalBytes > 0 ? clampPercent((usedBytes / totalBytes) * 100) : 0;

  return {
    usedBytes,
    totalBytes: totalBytes > 0 ? totalBytes : 0,
    usagePercent,
    available: pools.length > 0,
    pools: pools.map((pool) => ({
      name: pool.node ? `${pool.name} (${pool.node})` : pool.name,
      usedBytes: pool.usedBytes,
      totalBytes: pool.totalBytes > 0 ? pool.totalBytes : 1,
    })),
  };
}

export function buildSyncEvents(input: {
  infrastructure: Infrastructure;
  integrationName: string;
  collectedAt: string | null;
  stale: boolean;
}): SyncEvent[] {
  const events: SyncEvent[] = [];

  if (input.collectedAt) {
    events.push({
      id: "sync-success",
      title: "Data synchronized successfully",
      detail: input.integrationName,
      severity: input.infrastructure.partial ? "warning" : "info",
      at: input.collectedAt,
    });
  }

  if (input.stale) {
    events.push({
      id: "sync-stale",
      title: "Snapshot is stale",
      detail: "Showing the last successful collection",
      severity: "warning",
      at: input.collectedAt,
    });
  }

  for (const warning of input.infrastructure.warnings ?? []) {
    events.push({
      id: `warning-${warning.scope}-${warning.target ?? "cluster"}`,
      title: warning.message,
      detail: warning.target,
      severity: "warning",
      at: input.collectedAt,
    });
  }

  for (const node of input.infrastructure.nodes) {
    if (node.state === "down") {
      events.push({
        id: `node-down-${node.name}`,
        title: `Node ${node.name} is offline`,
        severity: "critical",
        at: input.collectedAt,
      });
    }
  }

  return events;
}

export function buildProxmoxOverviewSection(input: {
  infrastructure: Infrastructure;
  integrationId: string;
  integrationName: string;
  collectedAt: string | null;
  stale: boolean;
  lastError: string | null;
}): ProxmoxOverview {
  const { infrastructure } = input;
  const nodes = infrastructure.nodes;
  const nodeHealth = computeNodeHealth(nodes);

  let healthStatus: ServiceState = nodeHealth;
  if ((input.stale || infrastructure.partial) && healthStatus === "healthy") {
    healthStatus = "degraded";
  }
  if (infrastructure.healthStatus === "down") {
    healthStatus = "down";
  }

  const onlineNodes = nodes.filter(isNodeOnline).length;

  return {
    connected: true,
    stale: input.stale,
    partial: infrastructure.partial ?? false,
    integrationId: input.integrationId,
    integrationName: input.integrationName,
    collectedAt: input.collectedAt,
    healthStatus,
    lastError: input.lastError,
    version: infrastructure.cluster?.version,
    release: infrastructure.cluster?.release,
    systems: {
      healthy: onlineNodes,
      total: nodes.length,
    },
    cpu: aggregateCpu(nodes),
    memory: aggregateMemory(nodes),
    storage: aggregateStorage(nodes, infrastructure.clusterStorages ?? []),
    summary: aggregateWorkloads(nodes),
    warnings: infrastructure.warnings ?? [],
    syncEvents: buildSyncEvents({
      infrastructure,
      integrationName: input.integrationName,
      collectedAt: input.collectedAt,
      stale: input.stale,
    }),
  };
}

export async function getActiveProxmoxIntegrationRow(db: RackoraDatabase) {
  const enabled = await db.query.integrations.findFirst({
    where: and(eq(integrations.type, "proxmox"), eq(integrations.enabled, true)),
    orderBy: [desc(integrations.updatedAt)],
  });
  if (enabled) {
    return enabled;
  }

  return db.query.integrations.findFirst({
    where: eq(integrations.type, "proxmox"),
    orderBy: [desc(integrations.updatedAt)],
  });
}

export function isSnapshotStale(
  collectedAt: Date | null | undefined,
  pollIntervalMs: number,
): boolean {
  if (!collectedAt) {
    return true;
  }
  const ageMs = Date.now() - collectedAt.getTime();
  return ageMs > pollIntervalMs * 2;
}

export async function getDashboardOverview(
  db: RackoraDatabase,
): Promise<DashboardOverview> {
  const integrationRow = await getActiveProxmoxIntegrationRow(db);

  if (!integrationRow) {
    return dashboardOverviewSchema.parse({
      proxmox: {
        connected: false,
        message: "No Proxmox integration configured",
      },
    });
  }

  const integration = toIntegrationRecord(integrationRow);
  const latest = await db.query.snapshots.findFirst({
    where: eq(snapshots.integrationId, integrationRow.id),
    orderBy: [desc(snapshots.collectedAt)],
  });

  const successSnapshot =
    latest?.status === "success" && latest.payloadJson
      ? (JSON.parse(latest.payloadJson) as Infrastructure)
      : null;

  if (!successSnapshot || successSnapshot.nodes.length === 0) {
    return dashboardOverviewSchema.parse({
      proxmox: {
        connected: false,
        message: integration.lastError ?? "No Proxmox data available yet",
        integrationId: integration.id,
      },
    });
  }

  const collectedAt = latest?.collectedAt ?? null;
  const stale = isSnapshotStale(collectedAt, integrationRow.pollIntervalMs);

  const proxmox = buildProxmoxOverviewSection({
    infrastructure: successSnapshot,
    integrationId: integration.id,
    integrationName: integration.name,
    collectedAt: collectedAt?.toISOString() ?? null,
    stale,
    lastError: integration.lastError,
  });

  return dashboardOverviewSchema.parse({
    proxmox,
  });
}
