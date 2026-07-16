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

export const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1),
  role: z.string().min(1),
});

export type User = z.infer<typeof userSchema>;

export const setupStatusResponseSchema = z.object({
  setupRequired: z.boolean(),
  csrfToken: z.string().min(1),
});

export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;

export const setupRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
});

export type SetupRequest = z.infer<typeof setupRequestSchema>;

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userResponseSchema = z.object({
  user: userSchema,
  csrfToken: z.string().min(1),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

export const authMeResponseSchema = z.object({
  user: userSchema,
  csrfToken: z.string().min(1),
});

export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const csrfResponseSchema = z.object({
  csrfToken: z.string().min(1),
});

export type CsrfResponse = z.infer<typeof csrfResponseSchema>;

export const RACKORA_VERSION = "0.1.0";
