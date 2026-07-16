import { z } from "zod";

/** A generic severity level used across alerts and checks. */
export const severitySchema = z.enum(["info", "warning", "critical"]);
export type Severity = z.infer<typeof severitySchema>;

/** Health state used for systems, containers, checks and integrations. */
export const serviceStateSchema = z.enum([
  "healthy",
  "degraded",
  "down",
  "unknown",
]);
export type ServiceState = z.infer<typeof serviceStateSchema>;

/** A single point in a time series (ISO timestamp + numeric value). */
export const metricPointSchema = z.object({
  t: z.string().datetime(),
  value: z.number(),
});
export type MetricPoint = z.infer<typeof metricPointSchema>;

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

export const systemsSummarySchema = z.object({
  healthy: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const cpuSummarySchema = z.object({
  usagePercent: z.number().min(0).max(100),
  cores: z.number().int().positive(),
  history: z.array(metricPointSchema),
});

export const memorySummarySchema = z.object({
  usedBytes: z.number().nonnegative(),
  totalBytes: z.number().positive(),
  usagePercent: z.number().min(0).max(100),
  history: z.array(metricPointSchema),
});

export const storageSummarySchema = z.object({
  usedBytes: z.number().nonnegative(),
  totalBytes: z.number().positive(),
  usagePercent: z.number().min(0).max(100),
  pools: z.array(
    z.object({
      name: z.string().min(1),
      usedBytes: z.number().nonnegative(),
      totalBytes: z.number().positive(),
    }),
  ),
});

export const internetSummarySchema = z.object({
  latencyMs: z.number().nonnegative(),
  status: serviceStateSchema,
  target: z.string().min(1),
  history: z.array(metricPointSchema),
});

export const dockerSummarySchema = z.object({
  running: z.number().int().nonnegative(),
  stopped: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const updatesSummarySchema = z.object({
  available: z.number().int().nonnegative(),
  security: z.number().int().nonnegative(),
});

export const alertSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.string().min(1),
  severity: severitySchema,
  createdAt: z.string().datetime(),
  acknowledged: z.boolean(),
});
export type Alert = z.infer<typeof alertSchema>;

export const overviewSchema = z.object({
  systems: systemsSummarySchema,
  cpu: cpuSummarySchema,
  memory: memorySummarySchema,
  storage: storageSummarySchema,
  internet: internetSummarySchema,
  docker: dockerSummarySchema,
  updates: updatesSummarySchema,
  recentAlerts: z.array(alertSchema),
});
export type Overview = z.infer<typeof overviewSchema>;

/* -------------------------------------------------------------------------- */
/* Infrastructure                                                             */
/* -------------------------------------------------------------------------- */

export const guestKindSchema = z.enum(["qemu", "lxc"]);

export const storagePoolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  node: z.string().min(1),
  type: z.string().min(1),
  content: z.string().optional(),
  usedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  availBytes: z.number().nonnegative().optional(),
  usagePercent: z.number().min(0).max(100),
  state: serviceStateSchema,
  shared: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type StoragePool = z.infer<typeof storagePoolSchema>;

export const guestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: guestKindSchema,
  state: serviceStateSchema,
  cpuRatio: z.number().min(0).max(1).optional(),
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  uptimeSeconds: z.number().nonnegative(),
  vmid: z.number().int().nonnegative().optional(),
  node: z.string().optional(),
  status: z.string().optional(),
  cores: z.number().nonnegative().optional(),
  memoryBytes: z.number().nonnegative().optional(),
  maxMemoryBytes: z.number().nonnegative().optional(),
});
export type Guest = z.infer<typeof guestSchema>;

export const nodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  state: serviceStateSchema,
  cpuRatio: z.number().min(0).max(1).optional(),
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  storagePercent: z.number().min(0).max(100),
  uptimeSeconds: z.number().nonnegative(),
  guests: z.array(guestSchema),
  storages: z.array(storagePoolSchema).default([]),
  memoryBytes: z.number().nonnegative().optional(),
  maxMemoryBytes: z.number().nonnegative().optional(),
  cpuCount: z.number().nonnegative().optional(),
  proxmoxVersion: z.string().optional(),
  kernelVersion: z.string().optional(),
  loadAverage: z.number().optional(),
});
export type Node = z.infer<typeof nodeSchema>;

export const clusterInfoSchema = z.object({
  version: z.string().optional(),
  release: z.string().optional(),
});
export type ClusterInfo = z.infer<typeof clusterInfoSchema>;

export const collectionWarningSchema = z.object({
  scope: z.enum(["cluster", "node", "storage", "workload"]),
  target: z.string().optional(),
  message: z.string().min(1),
});
export type CollectionWarning = z.infer<typeof collectionWarningSchema>;

export const collectionStatusSchema = z.enum(["complete", "partial", "failed"]);
export type CollectionStatus = z.infer<typeof collectionStatusSchema>;

export const syncEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().optional(),
  severity: severitySchema,
  at: z.string().datetime().nullable(),
});
export type SyncEvent = z.infer<typeof syncEventSchema>;

export const infrastructureSchema = z.object({
  nodes: z.array(nodeSchema),
  cluster: clusterInfoSchema.optional(),
  clusterStorages: z.array(storagePoolSchema).default([]),
  collectedAt: z.string().datetime().nullable().optional(),
  integrationId: z.string().uuid().nullable().optional(),
  integrationName: z.string().optional(),
  healthStatus: serviceStateSchema.optional(),
  lastError: z.string().nullable().optional(),
  stale: z.boolean().optional(),
  partial: z.boolean().optional(),
  collectionStatus: collectionStatusSchema.optional(),
  warnings: z.array(collectionWarningSchema).default([]),
});
export type Infrastructure = z.infer<typeof infrastructureSchema>;

/* -------------------------------------------------------------------------- */
/* Docker                                                                     */
/* -------------------------------------------------------------------------- */

export const containerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  image: z.string().min(1),
  host: z.string().min(1),
  state: serviceStateSchema,
  status: z.string().min(1),
  cpuPercent: z.number().min(0).max(100),
  memoryMb: z.number().nonnegative(),
});
export type Container = z.infer<typeof containerSchema>;

export const dockerSchema = z.object({
  containers: z.array(containerSchema),
});
export type Docker = z.infer<typeof dockerSchema>;

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

export const checkKindSchema = z.enum(["http", "ping", "tcp"]);

export const checkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: checkKindSchema,
  target: z.string().min(1),
  state: serviceStateSchema,
  latencyMs: z.number().nonnegative().nullable(),
  lastCheckedAt: z.string().datetime(),
  uptimePercent: z.number().min(0).max(100),
});
export type Check = z.infer<typeof checkSchema>;

export const checksSchema = z.object({
  checks: z.array(checkSchema),
});
export type Checks = z.infer<typeof checksSchema>;

/* -------------------------------------------------------------------------- */
/* Updates                                                                    */
/* -------------------------------------------------------------------------- */

export const updateItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  host: z.string().min(1),
  currentVersion: z.string().min(1),
  availableVersion: z.string().min(1),
  security: z.boolean(),
});
export type UpdateItem = z.infer<typeof updateItemSchema>;

export const updatesSchema = z.object({
  items: z.array(updateItemSchema),
});
export type Updates = z.infer<typeof updatesSchema>;

/* -------------------------------------------------------------------------- */
/* Integrations                                                               */
/* -------------------------------------------------------------------------- */

export const integrationStatusSchema = z.enum([
  "connected",
  "disconnected",
  "error",
]);

export const integrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  status: integrationStatusSchema,
});
export type Integration = z.infer<typeof integrationSchema>;

export const integrationsSchema = z.object({
  integrations: z.array(integrationSchema),
});
export type Integrations = z.infer<typeof integrationsSchema>;
