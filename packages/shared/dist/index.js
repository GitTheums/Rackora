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
export const RACKORA_VERSION = "0.1.0";
//# sourceMappingURL=index.js.map