import { z } from "zod";
export declare const healthStatusSchema: z.ZodEnum<["ok", "degraded", "error"]>;
export declare const healthResponseSchema: z.ZodObject<{
    status: z.ZodEnum<["ok", "degraded", "error"]>;
    service: z.ZodLiteral<"rackora-server">;
    version: z.ZodString;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "ok" | "degraded" | "error";
    service: "rackora-server";
    version: string;
    timestamp: string;
}, {
    status: "ok" | "degraded" | "error";
    service: "rackora-server";
    version: string;
    timestamp: string;
}>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export declare const agentStatusSchema: z.ZodEnum<["idle", "running", "error"]>;
export declare const agentInfoSchema: z.ZodObject<{
    name: z.ZodLiteral<"rackora-agent">;
    version: z.ZodString;
    status: z.ZodEnum<["idle", "running", "error"]>;
}, "strip", z.ZodTypeAny, {
    status: "error" | "idle" | "running";
    version: string;
    name: "rackora-agent";
}, {
    status: "error" | "idle" | "running";
    version: string;
    name: "rackora-agent";
}>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentInfo = z.infer<typeof agentInfoSchema>;
export declare const RACKORA_VERSION = "0.1.0";
//# sourceMappingURL=index.d.ts.map