/**
 * CPU ratio helpers shared between backend normalization and frontend display.
 * Proxmox reports CPU usage as a fraction between 0 and 1.
 */

/** Convert a Proxmox CPU ratio (0–1) to a percentage (0–100) without rounding. */
export function cpuRatioToPercent(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  return ratio * 100;
}

/** Weighted average CPU ratio across online nodes. Returns undefined when no data. */
export function aggregateCpuRatio(
  nodes: Array<{ cpuRatio?: number; cpuCount?: number; state: string }>,
): { usageRatio: number; cores: number; available: boolean } {
  const online = nodes.filter((node) => node.state !== "down");
  let weighted = 0;
  let cores = 0;
  let ratioSum = 0;
  let ratioCount = 0;

  for (const node of online) {
    if (node.cpuRatio === undefined || !Number.isFinite(node.cpuRatio)) {
      continue;
    }

    const nodeCores = node.cpuCount ?? 0;
    if (nodeCores > 0) {
      weighted += node.cpuRatio * nodeCores;
      cores += nodeCores;
    } else {
      ratioSum += node.cpuRatio;
      ratioCount += 1;
    }
  }

  if (cores > 0) {
    return {
      usageRatio: weighted / cores,
      cores,
      available: true,
    };
  }

  if (ratioCount > 0) {
    return {
      usageRatio: ratioSum / ratioCount,
      cores: 0,
      available: true,
    };
  }

  return {
    usageRatio: 0,
    cores: online.reduce((sum, node) => sum + (node.cpuCount ?? 0), 0),
    available: false,
  };
}

/** Format CPU usage for display per Rackora rules. */
export function formatCpuUsage(input: {
  ratio?: number | null;
  percent?: number | null;
  available?: boolean;
}): string {
  if (input.available === false) {
    return "Unavailable";
  }

  const percent =
    input.percent ??
    (input.ratio !== undefined && input.ratio !== null
      ? cpuRatioToPercent(input.ratio)
      : null);

  if (percent === null || !Number.isFinite(percent)) {
    return "Unavailable";
  }

  if (percent === 0) {
    return "0%";
  }

  if (percent > 0 && percent < 0.1) {
    return "<0.1%";
  }

  if (percent < 10) {
    return `${percent.toFixed(1)}%`;
  }

  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded)
    ? `${Math.round(rounded)}%`
    : `${rounded.toFixed(1)}%`;
}

/** Parse CPU ratio from Proxmox node status or list item fields. */
export function parseProxmoxCpuRatio(input: {
  statusCpu?: number;
  listCpu?: number;
}): number | undefined {
  if (input.statusCpu !== undefined && Number.isFinite(input.statusCpu)) {
    return input.statusCpu;
  }
  if (input.listCpu !== undefined && Number.isFinite(input.listCpu)) {
    return input.listCpu;
  }
  return undefined;
}

/** True when a value already looks like a percentage rather than a 0–1 ratio. */
export function isLikelyCpuPercent(value: number): boolean {
  return value > 1;
}

/**
 * Normalize a Proxmox CPU field to a 0–1 ratio.
 * Does not divide values that are already percentages.
 */
export function normalizeCpuRatio(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  if (isLikelyCpuPercent(value)) {
    return value / 100;
  }
  return value;
}
