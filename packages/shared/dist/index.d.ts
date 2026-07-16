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
export declare const userSchema: z.ZodObject<{
    id: z.ZodString;
    username: z.ZodString;
    role: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    username: string;
    role: string;
}, {
    id: string;
    username: string;
    role: string;
}>;
export type User = z.infer<typeof userSchema>;
export declare const setupStatusResponseSchema: z.ZodObject<{
    setupRequired: z.ZodBoolean;
    csrfToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    setupRequired: boolean;
    csrfToken: string;
}, {
    setupRequired: boolean;
    csrfToken: string;
}>;
export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;
export declare const setupRequestSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    password: string;
}, {
    username: string;
    password: string;
}>;
export type SetupRequest = z.infer<typeof setupRequestSchema>;
export declare const loginRequestSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    password: string;
}, {
    username: string;
    password: string;
}>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export declare const userResponseSchema: z.ZodObject<{
    user: z.ZodObject<{
        id: z.ZodString;
        username: z.ZodString;
        role: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        username: string;
        role: string;
    }, {
        id: string;
        username: string;
        role: string;
    }>;
    csrfToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    csrfToken: string;
    user: {
        id: string;
        username: string;
        role: string;
    };
}, {
    csrfToken: string;
    user: {
        id: string;
        username: string;
        role: string;
    };
}>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export declare const authMeResponseSchema: z.ZodObject<{
    user: z.ZodObject<{
        id: z.ZodString;
        username: z.ZodString;
        role: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        username: string;
        role: string;
    }, {
        id: string;
        username: string;
        role: string;
    }>;
    csrfToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    csrfToken: string;
    user: {
        id: string;
        username: string;
        role: string;
    };
}, {
    csrfToken: string;
    user: {
        id: string;
        username: string;
        role: string;
    };
}>;
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
export declare const csrfResponseSchema: z.ZodObject<{
    csrfToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    csrfToken: string;
}, {
    csrfToken: string;
}>;
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;
export declare const RACKORA_VERSION = "0.1.0";
//# sourceMappingURL=index.d.ts.map