/** Format a byte count into a human readable string (e.g. "41.0 GB"). */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(exponent === 0 ? 0 : fractionDigits)} ${units[exponent]}`;
}

/** Format a percentage value with a trailing "%". */
export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits)}%`;
}

/** Format latency in milliseconds. */
export function formatLatency(ms: number | null): string {
  if (ms === null) {
    return "—";
  }

  return `${Math.round(ms)} ms`;
}

/** Format a duration given in seconds into a compact "12d 4h" style string. */
export function formatUptime(seconds: number): string {
  if (seconds <= 0) {
    return "—";
  }

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format an ISO timestamp as a relative time string ("5 min ago").
 * Accepts an optional "now" reference to keep tests deterministic.
 */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return "unknown";
  }

  const diffSeconds = Math.round((now - then) / 1000);

  if (diffSeconds < 45) {
    return "just now";
  }

  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
