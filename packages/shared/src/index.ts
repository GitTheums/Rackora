import { z } from "zod";

export const healthStatusSchema = z.enum(["ok", "degraded", "error"]);

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.literal("rackora-server"),
  version: z.string().min(1),
  timestamp: z.string().datetime(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const agentStatusSchema = z.enum(["idle", "running", "error"]);

export const agentInfoSchema = z.object({
  name: z.literal("rackora-agent"),
  version: z.string().min(1),
  status: agentStatusSchema,
});

export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentInfo = z.infer<typeof agentInfoSchema>;

export const RACKORA_VERSION = "0.1.0";
