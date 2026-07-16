import { z } from "zod";
export const healthStatusSchema = z.enum(["ok", "degraded", "error"]);
export const healthResponseSchema = z.object({
    status: healthStatusSchema,
    service: z.literal("rackora-server"),
    version: z.string().min(1),
    timestamp: z.string().datetime(),
});
export const agentStatusSchema = z.enum(["idle", "running", "error"]);
export const agentInfoSchema = z.object({
    name: z.literal("rackora-agent"),
    version: z.string().min(1),
    status: agentStatusSchema,
});
export const userSchema = z.object({
    id: z.string().uuid(),
    username: z.string().min(1),
    role: z.string().min(1),
});
export const setupStatusResponseSchema = z.object({
    setupRequired: z.boolean(),
    csrfToken: z.string().min(1),
});
export const setupRequestSchema = z.object({
    username: z
        .string()
        .trim()
        .min(3)
        .max(32)
        .regex(/^[a-zA-Z0-9_-]+$/),
    password: z.string().min(8).max(128),
});
export const loginRequestSchema = z.object({
    username: z.string().trim().min(1).max(32),
    password: z.string().min(1).max(128),
});
export const userResponseSchema = z.object({
    user: userSchema,
    csrfToken: z.string().min(1),
});
export const authMeResponseSchema = z.object({
    user: userSchema,
    csrfToken: z.string().min(1),
});
export const csrfResponseSchema = z.object({
    csrfToken: z.string().min(1),
});
export const RACKORA_VERSION = "0.1.0";
//# sourceMappingURL=index.js.map