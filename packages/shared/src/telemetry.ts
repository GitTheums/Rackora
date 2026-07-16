import { z } from "zod";

/** Current telemetry schema version carried by agent heartbeats. */
export const TELEMETRY_SCHEMA_VERSION = 1 as const;

/** Default agent heartbeat / telemetry interval. */
export const AGENT_HEARTBEAT_INTERVAL_MS = 30_000;

/** Hard limit for serialized telemetry JSON in a heartbeat (bytes). */
export const AGENT_TELEMETRY_MAX_BYTES = 200_000;

/** Max containers included in a single telemetry batch. */
export const AGENT_TELEMETRY_MAX_CONTAINERS = 40;

/** Max images included in a single telemetry batch. */
export const AGENT_TELEMETRY_MAX_IMAGES = 80;

/** Docker labels that may be forwarded to core. */
export const DOCKER_LABEL_ALLOWLIST = [
  "com.docker.compose.project",
  "com.docker.compose.service",
  "com.docker.compose.container-number",
  "org.opencontainers.image.title",
  "org.opencontainers.image.version",
  "org.opencontainers.image.revision",
  "maintainer",
] as const;

/** Filesystem mountpoints eligible for host telemetry. */
export const HOST_FILESYSTEM_ALLOWLIST = [
  "/",
  "/boot",
  "/home",
  "/var",
  "/opt",
  "/srv",
  "/mnt",
  "/media",
] as const;

export const dockerContainerStateSchema = z.enum([
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
  "unknown",
]);

export const dockerContainerHealthSchema = z.enum([
  "healthy",
  "unhealthy",
  "starting",
  "none",
]);

export const dockerContainerStatsSchema = z.object({
  cpuPercent: z.number().min(0),
  memoryUsageBytes: z.number().nonnegative(),
  memoryLimitBytes: z.number().nonnegative(),
  /** Derived memory usage percentage when a limit is known. */
  memoryPercent: z.number().min(0).max(100).optional(),
  netRxBytes: z.number().nonnegative(),
  netTxBytes: z.number().nonnegative(),
  blockReadBytes: z.number().nonnegative(),
  blockWriteBytes: z.number().nonnegative(),
});

export type DockerContainerStats = z.infer<typeof dockerContainerStatsSchema>;

export const dockerContainerTelemetrySchema = z.object({
  id: z.string().min(1).max(128),
  shortId: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(256),
  image: z.string().min(1).max(512),
  imageId: z.string().min(1).max(128).optional(),
  /** Immutable digest when available from RepoDigests / inspect. */
  imageDigest: z.string().min(1).max(512).optional(),
  state: dockerContainerStateSchema,
  health: dockerContainerHealthSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable().optional(),
  restartCount: z.number().int().nonnegative().optional(),
  labels: z.record(z.string().max(256)).default({}),
  stats: dockerContainerStatsSchema.optional(),
});

export type DockerContainerTelemetry = z.infer<
  typeof dockerContainerTelemetrySchema
>;

export const dockerImageTelemetrySchema = z.object({
  id: z.string().min(1).max(128),
  repositoryTags: z.array(z.string().max(512)).max(32),
  /** Immutable digests (RepoDigests) when the engine provides them. */
  digests: z.array(z.string().max(512)).max(32),
  sizeBytes: z.number().nonnegative(),
  createdAt: z.string().datetime().optional(),
});

export type DockerImageTelemetry = z.infer<typeof dockerImageTelemetrySchema>;

export const dockerEngineTelemetrySchema = z.object({
  version: z.string().min(1).max(64),
  apiVersion: z.string().min(1).max(32).optional(),
  os: z.string().min(1).max(64).optional(),
  architecture: z.string().min(1).max(64).optional(),
  ncpu: z.number().int().positive().optional(),
  memTotalBytes: z.number().nonnegative().optional(),
});

export type DockerEngineTelemetry = z.infer<typeof dockerEngineTelemetrySchema>;

export const dockerTelemetrySchema = z.object({
  available: z.boolean(),
  engine: dockerEngineTelemetrySchema.optional(),
  containers: z.array(dockerContainerTelemetrySchema).max(AGENT_TELEMETRY_MAX_CONTAINERS),
  images: z.array(dockerImageTelemetrySchema).max(AGENT_TELEMETRY_MAX_IMAGES),
  containerTotal: z.number().int().nonnegative(),
  imageTotal: z.number().int().nonnegative(),
  error: z.string().max(512).optional(),
});

export type DockerTelemetry = z.infer<typeof dockerTelemetrySchema>;

export const hostCpuTelemetrySchema = z.object({
  usagePercent: z.number().min(0).max(100),
  loadAverage: z.tuple([z.number(), z.number(), z.number()]),
  cores: z.number().int().positive(),
});

export const hostMemoryTelemetrySchema = z.object({
  totalBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative(),
  availableBytes: z.number().nonnegative().optional(),
  swapTotalBytes: z.number().nonnegative().optional(),
  swapUsedBytes: z.number().nonnegative().optional(),
});

export const hostFilesystemTelemetrySchema = z.object({
  mountpoint: z.string().min(1).max(512),
  fstype: z.string().min(1).max(64),
  totalBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative(),
  availableBytes: z.number().nonnegative(),
});

export const hostTemperatureTelemetrySchema = z.object({
  name: z.string().min(1).max(128),
  celsius: z.number(),
  source: z.enum(["thermal", "hwmon"]),
});

export const hostTelemetrySchema = z.object({
  hostname: z.string().min(1).max(255),
  os: z.string().min(1).max(128),
  architecture: z.string().min(1).max(64),
  uptimeSeconds: z.number().nonnegative(),
  cpu: hostCpuTelemetrySchema,
  memory: hostMemoryTelemetrySchema,
  filesystems: z.array(hostFilesystemTelemetrySchema).max(32),
  temperatures: z.array(hostTemperatureTelemetrySchema).max(64),
});

export type HostTelemetry = z.infer<typeof hostTelemetrySchema>;

export const telemetryBatchSchema = z.object({
  index: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  truncated: z.boolean(),
});

export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>;

export const agentTelemetryV1Schema = z.object({
  schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
  collectedAt: z.string().datetime(),
  agent: z.object({
    name: z.string().min(1).max(64),
    version: z.string().min(1).max(32),
  }),
  host: hostTelemetrySchema,
  docker: dockerTelemetrySchema,
  batch: telemetryBatchSchema.optional(),
  /** True when collection or batching omitted some data. */
  partial: z.boolean().optional(),
  /** Safe, non-secret collection diagnostics for operators. */
  warnings: z.array(z.string().max(512)).max(32).optional(),
});

export type AgentTelemetryV1 = z.infer<typeof agentTelemetryV1Schema>;

/** Discriminated union for future schema versions. */
export const agentTelemetrySchema = z.discriminatedUnion("schemaVersion", [
  agentTelemetryV1Schema,
]);

export type AgentTelemetry = z.infer<typeof agentTelemetrySchema>;

export const agentMetricSampleSchema = z.object({
  metricKey: z.string().min(1).max(128),
  value: z.number(),
  labels: z.record(z.string().max(128)).optional(),
  collectedAt: z.string().datetime(),
});

export type AgentMetricSample = z.infer<typeof agentMetricSampleSchema>;

export const agentTelemetryStateResponseSchema = z.object({
  agentId: z.string().uuid(),
  schemaVersion: z.number().int().positive(),
  collectedAt: z.string().datetime(),
  status: z.enum(["ok", "degraded", "error"]),
  telemetry: agentTelemetrySchema,
  updatedAt: z.string().datetime(),
});

export type AgentTelemetryStateResponse = z.infer<
  typeof agentTelemetryStateResponseSchema
>;

export function filterDockerLabels(
  labels: Record<string, string> | null | undefined,
  allowlist: readonly string[] = DOCKER_LABEL_ALLOWLIST,
): Record<string, string> {
  if (!labels) {
    return {};
  }
  const allowed = new Set(allowlist);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (allowed.has(key) && typeof value === "string") {
      result[key] = value.slice(0, 256);
    }
  }
  return result;
}

export function isAllowedFilesystemMount(
  mountpoint: string,
  allowlist: readonly string[] = HOST_FILESYSTEM_ALLOWLIST,
): boolean {
  const normalized =
    mountpoint.length > 1 && mountpoint.endsWith("/")
      ? mountpoint.slice(0, -1)
      : mountpoint;

  return allowlist.some(
    (allowed) =>
      normalized === allowed ||
      (allowed !== "/" && normalized.startsWith(`${allowed}/`)),
  );
}

/**
 * Measure UTF-8 byte length of a JSON value.
 */
export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
