import type { DockerContainerStats } from "@rackora/shared";
import type { DockerStatsResponse } from "./types.js";

export function computeContainerStats(
  stats: DockerStatsResponse,
): DockerContainerStats {
  const memoryUsageBytes = computeMemoryUsage(stats);
  const memoryLimitBytes = stats.memory_stats?.limit ?? 0;
  const memoryPercent =
    memoryLimitBytes > 0
      ? Math.min(
          100,
          Math.round((memoryUsageBytes / memoryLimitBytes) * 10_000) / 100,
        )
      : undefined;

  return {
    cpuPercent: computeCpuPercent(stats),
    memoryUsageBytes,
    memoryLimitBytes,
    memoryPercent,
    netRxBytes: sumNetwork(stats, "rx_bytes"),
    netTxBytes: sumNetwork(stats, "tx_bytes"),
    blockReadBytes: sumBlkio(stats, "read"),
    blockWriteBytes: sumBlkio(stats, "write"),
  };
}

function computeCpuPercent(stats: DockerStatsResponse): number {
  const cpuDelta =
    (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
    (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    (stats.cpu_stats?.system_cpu_usage ?? 0) -
    (stats.precpu_stats?.system_cpu_usage ?? 0);

  if (cpuDelta <= 0 || systemDelta <= 0) {
    return 0;
  }

  const online =
    stats.cpu_stats?.online_cpus ??
    stats.cpu_stats?.cpu_usage?.percpu_usage?.length ??
    1;

  const percent = (cpuDelta / systemDelta) * online * 100;
  if (!Number.isFinite(percent) || percent < 0) {
    return 0;
  }
  return Math.round(percent * 100) / 100;
}

function computeMemoryUsage(stats: DockerStatsResponse): number {
  const usage = stats.memory_stats?.usage ?? 0;
  const cache = stats.memory_stats?.stats?.cache ?? 0;
  return Math.max(0, usage - cache);
}

function sumNetwork(
  stats: DockerStatsResponse,
  field: "rx_bytes" | "tx_bytes",
): number {
  if (!stats.networks) {
    return 0;
  }
  let total = 0;
  for (const network of Object.values(stats.networks)) {
    total += network[field] ?? 0;
  }
  return total;
}

function sumBlkio(stats: DockerStatsResponse, op: "read" | "write"): number {
  const entries = stats.blkio_stats?.io_service_bytes_recursive ?? [];
  let total = 0;
  for (const entry of entries) {
    if ((entry.op ?? "").toLowerCase() === op) {
      total += entry.value ?? 0;
    }
  }
  return total;
}
