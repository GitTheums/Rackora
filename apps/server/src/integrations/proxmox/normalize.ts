import {
  cpuRatioToPercent,
  infrastructureSchema,
  normalizeCpuRatio,
  parseProxmoxCpuRatio,
  type Guest,
  type Infrastructure,
  type Node,
  type ServiceState,
  type StoragePool,
} from "@rackora/shared";
import type {
  ProxmoxClusterResource,
  ProxmoxNodeListItem,
  ProxmoxNodeStatus,
  ProxmoxRawSnapshot,
  ProxmoxStorage,
} from "./types.js";

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function optionalBytes(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function mapGuestState(status: string | undefined): ServiceState {
  switch ((status ?? "").toLowerCase()) {
    case "running":
      return "healthy";
    case "paused":
    case "suspended":
      return "degraded";
    case "stopped":
    case "offline":
      return "down";
    default:
      return "unknown";
  }
}

function mapNodeState(status: string | undefined): ServiceState {
  switch ((status ?? "").toLowerCase()) {
    case "online":
      return "healthy";
    case "offline":
      return "down";
    default:
      return "unknown";
  }
}

function mapStorageState(storage: ProxmoxStorage): ServiceState {
  if (storage.active === 1 || storage.enabled === 1) {
    return "healthy";
  }
  if (storage.enabled === 0) {
    return "down";
  }
  return "unknown";
}

function normalizeGuest(resource: ProxmoxClusterResource): Guest | null {
  if (resource.template === 1) {
    return null;
  }

  const kind = resource.type === "qemu" || resource.type === "lxc"
    ? resource.type
    : null;
  if (!kind) {
    return null;
  }

  const vmid = resource.vmid ?? 0;
  const name = resource.name ?? `guest-${vmid}`;
  const maxmem = resource.maxmem ?? 0;
  const mem = resource.mem ?? 0;
  const cpuRatio = normalizeCpuRatio(resource.cpu);

  return {
    id: `${kind}:${resource.node ?? "unknown"}:${vmid}`,
    name,
    kind,
    state: mapGuestState(resource.status),
    cpuRatio,
    cpuPercent: cpuRatio !== undefined ? cpuRatioToPercent(cpuRatio) : 0,
    memoryPercent: maxmem > 0 ? clampPercent((mem / maxmem) * 100) : 0,
    uptimeSeconds: resource.uptime ?? 0,
    vmid,
    node: resource.node,
    status: resource.status,
    cores: resource.maxcpu,
    memoryBytes: optionalBytes(mem),
    maxMemoryBytes: optionalBytes(maxmem),
  };
}

function normalizeStoragePool(
  nodeName: string,
  storage: ProxmoxStorage,
): StoragePool | null {
  const name = storage.storage;
  if (!name) {
    return null;
  }

  const total = storage.total ?? 0;
  const used = storage.used ?? 0;
  const avail = storage.avail;

  return {
    id: `storage:${nodeName}:${name}`,
    name,
    node: nodeName,
    type: storage.type ?? "unknown",
    content: storage.content,
    usedBytes: used,
    totalBytes: total,
    availBytes: avail,
    usagePercent: total > 0 ? clampPercent((used / total) * 100) : 0,
    state: mapStorageState(storage),
    shared: storage.shared === 1,
    active: storage.active === 1,
  };
}

function mergeNodeListItem(
  existing: ProxmoxNodeListItem | undefined,
  resource: ProxmoxClusterResource,
): ProxmoxNodeListItem {
  return {
    node: resource.node ?? existing?.node,
    status: resource.status ?? existing?.status,
    cpu: resource.cpu ?? existing?.cpu,
    maxcpu: resource.maxcpu ?? existing?.maxcpu,
    mem: resource.mem ?? existing?.mem,
    maxmem: resource.maxmem ?? existing?.maxmem,
    uptime: resource.uptime ?? existing?.uptime,
  };
}

function resolveNodeMetrics(
  listItem: ProxmoxNodeListItem | undefined,
  status: ProxmoxNodeStatus | null | undefined,
): {
  cpuRatio?: number;
  cpuPercent: number;
  memoryPercent: number;
  storagePercent: number;
  uptimeSeconds: number;
  memoryBytes?: number;
  maxMemoryBytes?: number;
  cpuCount?: number;
  proxmoxVersion?: string;
  kernelVersion?: string;
  loadAverage?: number;
} {
  const cpuRatio = parseProxmoxCpuRatio({
    statusCpu: status?.cpu,
    listCpu: listItem?.cpu,
  });
  const cpuPercent =
    cpuRatio !== undefined ? cpuRatioToPercent(cpuRatio) : 0;

  const memUsed = status?.memory?.used ?? listItem?.mem;
  const memTotal = status?.memory?.total ?? listItem?.maxmem;
  const memoryPercent =
    memTotal !== undefined && memTotal > 0 && memUsed !== undefined
      ? clampPercent((memUsed / memTotal) * 100)
      : 0;

  const rootUsed = status?.rootfs?.used ?? 0;
  const rootTotal = status?.rootfs?.total ?? 0;
  const storagePercent =
    rootTotal > 0 ? clampPercent((rootUsed / rootTotal) * 100) : 0;

  return {
    cpuRatio,
    cpuPercent,
    memoryPercent,
    storagePercent,
    uptimeSeconds: status?.uptime ?? listItem?.uptime ?? 0,
    memoryBytes: optionalBytes(memUsed),
    maxMemoryBytes: optionalBytes(memTotal),
    cpuCount: status?.cpuinfo?.cpus ?? listItem?.maxcpu,
    proxmoxVersion: status?.pveversion,
    kernelVersion: status?.kversion,
    loadAverage: status?.wait,
  };
}

/**
 * Normalize a Proxmox collection payload into shared Infrastructure DTOs.
 * Tolerates missing fields and partial node status/storage maps.
 */
export function normalizeProxmoxSnapshot(raw: ProxmoxRawSnapshot): Infrastructure {
  const nodeMap = new Map<string, ProxmoxNodeListItem>();

  for (const item of raw.nodes) {
    if (item.node) {
      nodeMap.set(item.node, item);
    }
  }

  for (const resource of raw.resources) {
    if (!resource.node) {
      continue;
    }

    if (resource.type === "node") {
      const existing = nodeMap.get(resource.node);
      nodeMap.set(resource.node, mergeNodeListItem(existing, resource));
      continue;
    }

    if (!nodeMap.has(resource.node)) {
      nodeMap.set(resource.node, {
        node: resource.node,
        status: resource.status ?? "unknown",
      });
    }
  }

  const guestsByNode = new Map<string, Guest[]>();
  for (const resource of raw.resources) {
    if (resource.type !== "qemu" && resource.type !== "lxc") {
      continue;
    }
    const guest = normalizeGuest(resource);
    if (!guest || !resource.node) {
      continue;
    }
    const list = guestsByNode.get(resource.node) ?? [];
    list.push(guest);
    guestsByNode.set(resource.node, list);
  }

  const clusterStorages = raw.clusterStorage
    .map((storage) => normalizeStoragePool(storage.storage ?? "cluster", storage))
    .filter((item): item is StoragePool => item !== null);

  const nodes: Node[] = [...nodeMap.entries()]
    .map(([name, listItem]) => {
      const metrics = resolveNodeMetrics(listItem, raw.nodeStatus[name]);
      const storages = (raw.storages[name] ?? [])
        .map((storage) => normalizeStoragePool(name, storage))
        .filter((item): item is StoragePool => item !== null);

      let storagePercent = metrics.storagePercent;
      if (storagePercent === 0 && storages.length > 0) {
        const total = storages.reduce((sum, item) => sum + item.totalBytes, 0);
        const used = storages.reduce((sum, item) => sum + item.usedBytes, 0);
        storagePercent = total > 0 ? clampPercent((used / total) * 100) : 0;
      }

      return {
        id: `node:${name}`,
        name,
        state: mapNodeState(listItem.status),
        cpuRatio: metrics.cpuRatio,
        cpuPercent: metrics.cpuPercent,
        memoryPercent: metrics.memoryPercent,
        storagePercent,
        uptimeSeconds: metrics.uptimeSeconds,
        guests: (guestsByNode.get(name) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        storages,
        memoryBytes: metrics.memoryBytes,
        maxMemoryBytes: metrics.maxMemoryBytes,
        cpuCount: metrics.cpuCount,
        proxmoxVersion: metrics.proxmoxVersion,
        kernelVersion: metrics.kernelVersion,
        loadAverage: metrics.loadAverage,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return infrastructureSchema.parse({
    nodes,
    cluster: {
      version: raw.version.version,
      release: raw.version.release,
    },
    collectionStatus: raw.collectionStatus,
    partial: raw.collectionStatus === "partial",
    warnings: raw.warnings,
    clusterStorages,
  });
}
