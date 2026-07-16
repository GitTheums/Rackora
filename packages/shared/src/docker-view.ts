import { z } from "zod";
import { agentConnectionStatusSchema } from "./agents.js";
import {
  dockerContainerHealthSchema,
  dockerContainerStateSchema,
  hostFilesystemTelemetrySchema,
  hostTemperatureTelemetrySchema,
} from "./telemetry.js";

/**
 * Aggregated Docker / host views for the authenticated web UI.
 * Built from enrolled agents + latest telemetry snapshots — never from mocks.
 */

export const dockerFleetSummarySchema = z.object({
  totalAgents: z.number().int().nonnegative(),
  onlineAgents: z.number().int().nonnegative(),
  dockerConnectedAgents: z.number().int().nonnegative(),
  totalContainers: z.number().int().nonnegative(),
  runningContainers: z.number().int().nonnegative(),
  stoppedContainers: z.number().int().nonnegative(),
  unhealthyContainers: z.number().int().nonnegative(),
  lastUpdatedAt: z.string().datetime().nullable(),
  stale: z.boolean(),
  partial: z.boolean(),
  warnings: z.array(z.string()).default([]),
  /** High-level page state for empty / waiting / unavailable UX. */
  pageState: z.enum([
    "no_agents",
    "waiting_for_telemetry",
    "docker_unavailable",
    "ready",
  ]),
});

export type DockerFleetSummary = z.infer<typeof dockerFleetSummarySchema>;

export const dockerContainerViewSchema = z.object({
  agentId: z.string().uuid(),
  agentName: z.string().min(1),
  hostname: z.string().nullable(),
  id: z.string().min(1),
  shortId: z.string().min(1),
  name: z.string().min(1),
  image: z.string().min(1),
  imageId: z.string().nullable(),
  imageDigest: z.string().nullable(),
  state: dockerContainerStateSchema,
  health: dockerContainerHealthSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  restartCount: z.number().int().nonnegative().nullable(),
  cpuPercent: z.number().min(0).nullable(),
  memoryUsedBytes: z.number().nonnegative().nullable(),
  memoryLimitBytes: z.number().nonnegative().nullable(),
  memoryPercent: z.number().min(0).max(100).nullable(),
  netRxBytes: z.number().nonnegative().nullable(),
  netTxBytes: z.number().nonnegative().nullable(),
  blockReadBytes: z.number().nonnegative().nullable(),
  blockWriteBytes: z.number().nonnegative().nullable(),
  labels: z.record(z.string()),
  collectedAt: z.string().datetime(),
  stale: z.boolean(),
  partial: z.boolean(),
});

export type DockerContainerView = z.infer<typeof dockerContainerViewSchema>;

export const dockerContainerListResponseSchema = z.object({
  containers: z.array(dockerContainerViewSchema),
  stale: z.boolean(),
  partial: z.boolean(),
  warnings: z.array(z.string()).default([]),
  lastUpdatedAt: z.string().datetime().nullable(),
});

export type DockerContainerListResponse = z.infer<
  typeof dockerContainerListResponseSchema
>;

export const dockerContainerDetailResponseSchema = z.object({
  container: dockerContainerViewSchema,
});

export type DockerContainerDetailResponse = z.infer<
  typeof dockerContainerDetailResponseSchema
>;

export const dockerAgentViewSchema = z.object({
  agentId: z.string().uuid(),
  name: z.string().min(1),
  status: agentConnectionStatusSchema,
  hostname: z.string().nullable(),
  agentVersion: z.string().nullable(),
  dockerAvailable: z.boolean().nullable(),
  dockerEngineVersion: z.string().nullable(),
  containerCount: z.number().int().nonnegative().nullable(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  lastTelemetryAt: z.string().datetime().nullable(),
  stale: z.boolean(),
  partial: z.boolean(),
  warnings: z.array(z.string()).default([]),
});

export type DockerAgentView = z.infer<typeof dockerAgentViewSchema>;

export const dockerAgentListResponseSchema = z.object({
  agents: z.array(dockerAgentViewSchema),
});

export type DockerAgentListResponse = z.infer<
  typeof dockerAgentListResponseSchema
>;

export const hostViewSchema = z.object({
  agentId: z.string().uuid(),
  agentName: z.string().min(1),
  status: agentConnectionStatusSchema,
  agentVersion: z.string().nullable(),
  hostname: z.string().nullable(),
  os: z.string().nullable(),
  architecture: z.string().nullable(),
  uptimeSeconds: z.number().nonnegative().nullable(),
  cpuUsagePercent: z.number().min(0).max(100).nullable(),
  cpuCores: z.number().int().positive().nullable(),
  loadAverage: z
    .tuple([z.number(), z.number(), z.number()])
    .nullable(),
  memoryUsedBytes: z.number().nonnegative().nullable(),
  memoryTotalBytes: z.number().nonnegative().nullable(),
  memoryAvailableBytes: z.number().nonnegative().nullable(),
  swapUsedBytes: z.number().nonnegative().nullable(),
  swapTotalBytes: z.number().nonnegative().nullable(),
  filesystems: z.array(hostFilesystemTelemetrySchema),
  temperatures: z.array(hostTemperatureTelemetrySchema),
  dockerAvailable: z.boolean().nullable(),
  dockerEngineVersion: z.string().nullable(),
  containerCount: z.number().int().nonnegative().nullable(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  lastTelemetryAt: z.string().datetime().nullable(),
  stale: z.boolean(),
  partial: z.boolean(),
  warnings: z.array(z.string()).default([]),
});

export type HostView = z.infer<typeof hostViewSchema>;

export const hostListResponseSchema = z.object({
  hosts: z.array(hostViewSchema),
  stale: z.boolean(),
  partial: z.boolean(),
  lastUpdatedAt: z.string().datetime().nullable(),
});

export type HostListResponse = z.infer<typeof hostListResponseSchema>;

export const hostDetailResponseSchema = z.object({
  host: hostViewSchema,
});

export type HostDetailResponse = z.infer<typeof hostDetailResponseSchema>;
