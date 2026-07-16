import {
  AGENT_ONLINE_THRESHOLD_MS,
  calculateAgentConnectionStatus,
  dockerAgentListResponseSchema,
  dockerContainerDetailResponseSchema,
  dockerContainerListResponseSchema,
  dockerFleetSummarySchema,
  hostDetailResponseSchema,
  hostListResponseSchema,
  type AgentResponse,
  type DockerAgentListResponse,
  type DockerContainerDetailResponse,
  type DockerContainerListResponse,
  type DockerContainerView,
  type DockerFleetSummary,
  type HostDetailResponse,
  type HostListResponse,
  type HostView,
  type AgentTelemetry,
} from "@rackora/shared";
import type { RackoraDatabase } from "../db/client.js";
import { getAgentTelemetryState } from "./agent-telemetry.js";
import { listAgents } from "./agents.js";

type AgentSnapshot = {
  agent: AgentResponse;
  telemetry: AgentTelemetry | null;
  collectedAt: string | null;
  warnings: string[];
  partial: boolean;
  stale: boolean;
};

function isStale(collectedAt: string | null, nowMs: number): boolean {
  if (!collectedAt) {
    return true;
  }
  const age = nowMs - Date.parse(collectedAt);
  return !Number.isFinite(age) || age > AGENT_ONLINE_THRESHOLD_MS;
}

async function loadSnapshots(
  db: RackoraDatabase,
  nowMs = Date.now(),
): Promise<AgentSnapshot[]> {
  const { agents } = await listAgents(db);
  const snapshots: AgentSnapshot[] = [];

  for (const agent of agents) {
    if (agent.status === "revoked") {
      continue;
    }

    const state = await getAgentTelemetryState(db, agent.id);
    const telemetry = state?.telemetry ?? null;
    const collectedAt = state?.collectedAt ?? agent.telemetryReceivedAt;
    const warnings = [
      ...(telemetry?.warnings ?? []),
      ...(telemetry?.docker.error ? [telemetry.docker.error] : []),
    ];
    const partial = Boolean(
      telemetry?.partial || telemetry?.batch?.truncated || telemetry?.docker.error,
    );

    snapshots.push({
      agent,
      telemetry,
      collectedAt,
      warnings,
      partial,
      stale: isStale(collectedAt, nowMs),
    });
  }

  return snapshots;
}

function mapContainer(
  snapshot: AgentSnapshot,
  container: NonNullable<AgentTelemetry["docker"]["containers"]>[number],
): DockerContainerView {
  const stats = container.stats;
  const hostname =
    snapshot.telemetry?.host.hostname ?? snapshot.agent.hostname ?? null;

  return {
    agentId: snapshot.agent.id,
    agentName: snapshot.agent.name,
    hostname,
    id: container.id,
    shortId: container.shortId ?? container.id.slice(0, 12),
    name: container.name,
    image: container.image,
    imageId: container.imageId ?? null,
    imageDigest: container.imageDigest ?? null,
    state: container.state,
    health: container.health,
    createdAt: container.createdAt,
    startedAt: container.startedAt ?? null,
    restartCount: container.restartCount ?? null,
    cpuPercent: stats?.cpuPercent ?? null,
    memoryUsedBytes: stats?.memoryUsageBytes ?? null,
    memoryLimitBytes: stats?.memoryLimitBytes ?? null,
    memoryPercent:
      stats?.memoryPercent ??
      (stats && stats.memoryLimitBytes > 0
        ? Math.min(
            100,
            Math.round(
              (stats.memoryUsageBytes / stats.memoryLimitBytes) * 10_000,
            ) / 100,
          )
        : null),
    netRxBytes: stats?.netRxBytes ?? null,
    netTxBytes: stats?.netTxBytes ?? null,
    blockReadBytes: stats?.blockReadBytes ?? null,
    blockWriteBytes: stats?.blockWriteBytes ?? null,
    labels: container.labels ?? {},
    collectedAt: snapshot.collectedAt ?? snapshot.agent.enrolledAt,
    stale: snapshot.stale,
    partial: snapshot.partial,
  };
}

function mapHost(snapshot: AgentSnapshot): HostView {
  const host = snapshot.telemetry?.host;
  const docker = snapshot.telemetry?.docker;

  return {
    agentId: snapshot.agent.id,
    agentName: snapshot.agent.name,
    status: snapshot.agent.status,
    agentVersion:
      snapshot.telemetry?.agent.version ?? snapshot.agent.version ?? null,
    hostname: host?.hostname ?? snapshot.agent.hostname ?? null,
    os: host?.os ?? snapshot.agent.os ?? null,
    architecture: host?.architecture ?? snapshot.agent.architecture ?? null,
    uptimeSeconds: host?.uptimeSeconds ?? null,
    cpuUsagePercent: host?.cpu.usagePercent ?? snapshot.agent.cpuUsagePercent,
    cpuCores: host?.cpu.cores ?? null,
    loadAverage: host?.cpu.loadAverage ?? null,
    memoryUsedBytes: host?.memory.usedBytes ?? snapshot.agent.memoryUsedBytes,
    memoryTotalBytes:
      host?.memory.totalBytes ?? snapshot.agent.memoryTotalBytes,
    memoryAvailableBytes: host?.memory.availableBytes ?? null,
    swapUsedBytes: host?.memory.swapUsedBytes ?? null,
    swapTotalBytes: host?.memory.swapTotalBytes ?? null,
    filesystems: host?.filesystems ?? [],
    temperatures: host?.temperatures ?? [],
    dockerAvailable:
      docker?.available ?? snapshot.agent.dockerAvailable ?? null,
    dockerEngineVersion:
      docker?.engine?.version ?? snapshot.agent.dockerEngineVersion ?? null,
    containerCount:
      docker?.containerTotal ?? snapshot.agent.containerCount ?? null,
    lastHeartbeatAt: snapshot.agent.lastHeartbeatAt,
    lastTelemetryAt: snapshot.collectedAt,
    stale: snapshot.stale,
    partial: snapshot.partial,
    warnings: snapshot.warnings,
  };
}

function mapDockerAgent(snapshot: AgentSnapshot) {
  return {
    agentId: snapshot.agent.id,
    name: snapshot.agent.name,
    status: snapshot.agent.status,
    hostname: snapshot.telemetry?.host.hostname ?? snapshot.agent.hostname,
    agentVersion:
      snapshot.telemetry?.agent.version ?? snapshot.agent.version ?? null,
    dockerAvailable:
      snapshot.telemetry?.docker.available ??
      snapshot.agent.dockerAvailable ??
      null,
    dockerEngineVersion:
      snapshot.telemetry?.docker.engine?.version ??
      snapshot.agent.dockerEngineVersion ??
      null,
    containerCount:
      snapshot.telemetry?.docker.containerTotal ??
      snapshot.agent.containerCount ??
      null,
    lastHeartbeatAt: snapshot.agent.lastHeartbeatAt,
    lastTelemetryAt: snapshot.collectedAt,
    stale: snapshot.stale,
    partial: snapshot.partial,
    warnings: snapshot.warnings,
  };
}

export async function getDockerSummary(
  db: RackoraDatabase,
  nowMs = Date.now(),
): Promise<DockerFleetSummary> {
  const snapshots = await loadSnapshots(db, nowMs);
  const containers = snapshots.flatMap((snapshot) =>
    (snapshot.telemetry?.docker.containers ?? []).map((container) =>
      mapContainer(snapshot, container),
    ),
  );

  const hasTelemetry = snapshots.some((snapshot) => snapshot.telemetry !== null);
  const anyDockerAvailable = snapshots.some(
    (snapshot) => snapshot.telemetry?.docker.available === true,
  );

  let pageState: DockerFleetSummary["pageState"] = "ready";
  if (snapshots.length === 0) {
    pageState = "no_agents";
  } else if (!hasTelemetry) {
    pageState = "waiting_for_telemetry";
  } else if (!anyDockerAvailable) {
    pageState = "docker_unavailable";
  }

  const lastUpdatedAt =
    snapshots
      .map((snapshot) => snapshot.collectedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return dockerFleetSummarySchema.parse({
    totalAgents: snapshots.length,
    onlineAgents: snapshots.filter((snapshot) => snapshot.agent.status === "online")
      .length,
    dockerConnectedAgents: snapshots.filter(
      (snapshot) => snapshot.telemetry?.docker.available === true,
    ).length,
    totalContainers: containers.length,
    runningContainers: containers.filter(
      (container) => container.state === "running",
    ).length,
    stoppedContainers: containers.filter(
      (container) =>
        container.state === "exited" ||
        container.state === "dead" ||
        container.state === "created",
    ).length,
    unhealthyContainers: containers.filter(
      (container) => container.health === "unhealthy",
    ).length,
    lastUpdatedAt,
    stale: snapshots.some((snapshot) => snapshot.stale) || containers.some((c) => c.stale),
    partial: snapshots.some((snapshot) => snapshot.partial),
    warnings: [...new Set(snapshots.flatMap((snapshot) => snapshot.warnings))],
    pageState,
  });
}

export async function listDockerAgents(
  db: RackoraDatabase,
): Promise<DockerAgentListResponse> {
  const snapshots = await loadSnapshots(db);
  return dockerAgentListResponseSchema.parse({
    agents: snapshots.map(mapDockerAgent),
  });
}

export async function listDockerContainers(
  db: RackoraDatabase,
): Promise<DockerContainerListResponse> {
  const snapshots = await loadSnapshots(db);
  const containers = snapshots.flatMap((snapshot) =>
    (snapshot.telemetry?.docker.containers ?? []).map((container) =>
      mapContainer(snapshot, container),
    ),
  );

  const lastUpdatedAt =
    containers
      .map((container) => container.collectedAt)
      .sort()
      .at(-1) ?? null;

  return dockerContainerListResponseSchema.parse({
    containers,
    stale: containers.some((container) => container.stale),
    partial: containers.some((container) => container.partial),
    warnings: [
      ...new Set(snapshots.flatMap((snapshot) => snapshot.warnings)),
    ],
    lastUpdatedAt,
  });
}

export async function getDockerContainer(
  db: RackoraDatabase,
  agentId: string,
  containerId: string,
): Promise<DockerContainerDetailResponse | null> {
  const list = await listDockerContainers(db);
  const container = list.containers.find(
    (entry) =>
      entry.agentId === agentId &&
      (entry.id === containerId ||
        entry.shortId === containerId ||
        entry.id.startsWith(containerId)),
  );
  if (!container) {
    return null;
  }
  return dockerContainerDetailResponseSchema.parse({ container });
}

export async function listHosts(
  db: RackoraDatabase,
): Promise<HostListResponse> {
  const snapshots = await loadSnapshots(db);
  const hosts = snapshots.map(mapHost);
  const lastUpdatedAt =
    hosts
      .map((host) => host.lastTelemetryAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return hostListResponseSchema.parse({
    hosts,
    stale: hosts.some((host) => host.stale),
    partial: hosts.some((host) => host.partial),
    lastUpdatedAt,
  });
}

export async function getHost(
  db: RackoraDatabase,
  agentId: string,
): Promise<HostDetailResponse | null> {
  const list = await listHosts(db);
  const host = list.hosts.find((entry) => entry.agentId === agentId);
  if (!host) {
    return null;
  }
  return hostDetailResponseSchema.parse({ host });
}

/** Exported for tests — connection status still comes from heartbeats. */
export function agentStatusFromHeartbeat(
  revoked: boolean,
  lastHeartbeatAt: string | null,
  nowMs = Date.now(),
) {
  return calculateAgentConnectionStatus({
    revoked,
    lastHeartbeatAt,
    nowMs,
  });
}
