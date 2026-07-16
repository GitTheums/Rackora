import { z } from "zod";
import {
  metricPointSchema,
  serviceStateSchema,
  syncEventSchema,
  systemsSummarySchema,
} from "./dashboard.js";

export const infrastructureWorkloadSummarySchema = z.object({
  nodesTotal: z.number().int().nonnegative(),
  nodesOnline: z.number().int().nonnegative(),
  nodesOffline: z.number().int().nonnegative(),
  qemuTotal: z.number().int().nonnegative(),
  lxcTotal: z.number().int().nonnegative(),
  workloadsRunning: z.number().int().nonnegative(),
  workloadsStopped: z.number().int().nonnegative(),
});
export type InfrastructureWorkloadSummary = z.infer<
  typeof infrastructureWorkloadSummarySchema
>;

export const cpuOverviewSchema = z.object({
  usageRatio: z.number().min(0).max(1).optional(),
  usagePercent: z.number().min(0).max(100),
  cores: z.number().int().nonnegative(),
  available: z.boolean(),
  historyAvailable: z.boolean(),
  history: z.array(metricPointSchema),
});
export type CpuOverview = z.infer<typeof cpuOverviewSchema>;

export const memoryOverviewSchema = z.object({
  usedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  usagePercent: z.number().min(0).max(100),
  available: z.boolean(),
  historyAvailable: z.boolean(),
  history: z.array(metricPointSchema),
});
export type MemoryOverview = z.infer<typeof memoryOverviewSchema>;

export const storageOverviewSchema = z.object({
  usedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  usagePercent: z.number().min(0).max(100),
  available: z.boolean(),
  pools: z.array(
    z.object({
      name: z.string().min(1),
      usedBytes: z.number().nonnegative(),
      totalBytes: z.number().positive(),
    }),
  ),
});
export type StorageOverview = z.infer<typeof storageOverviewSchema>;

export const proxmoxOverviewConnectedSchema = z.object({
  connected: z.literal(true),
  stale: z.boolean(),
  partial: z.boolean(),
  integrationId: z.string().uuid(),
  integrationName: z.string().min(1),
  collectedAt: z.string().datetime().nullable(),
  healthStatus: serviceStateSchema,
  lastError: z.string().nullable(),
  version: z.string().optional(),
  release: z.string().optional(),
  systems: systemsSummarySchema,
  cpu: cpuOverviewSchema,
  memory: memoryOverviewSchema,
  storage: storageOverviewSchema,
  summary: infrastructureWorkloadSummarySchema,
  warnings: z.array(z.object({
    scope: z.enum(["cluster", "node", "storage", "workload"]),
    target: z.string().optional(),
    message: z.string(),
  })),
  syncEvents: z.array(syncEventSchema),
});

export const proxmoxOverviewDisconnectedSchema = z.object({
  connected: z.literal(false),
  message: z.string(),
  integrationId: z.string().uuid().nullable().optional(),
});

export const proxmoxOverviewSchema = z.discriminatedUnion("connected", [
  proxmoxOverviewConnectedSchema,
  proxmoxOverviewDisconnectedSchema,
]);
export type ProxmoxOverview = z.infer<typeof proxmoxOverviewSchema>;

export const dashboardOverviewSchema = z.object({
  proxmox: proxmoxOverviewSchema,
});
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;
