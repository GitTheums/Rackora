#!/usr/bin/env node
import { AGENT_HEARTBEAT_INTERVAL_MS, type AgentInfo } from "@rackora/shared";
import { type AgentHttpClient } from "./client.js";
import type { DockerClient } from "./docker/types.js";
import { type TelemetryCollector } from "./telemetry/collect.js";
export type AgentRuntimeOptions = {
    env?: NodeJS.ProcessEnv;
    client?: AgentHttpClient;
    dockerClient?: DockerClient | null;
    telemetryCollector?: TelemetryCollector;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    log?: (message: string) => void;
    /** When set, stop after this many loop iterations (tests). */
    maxIterations?: number;
};
export declare function getAgentInfo(status?: AgentInfo["status"]): AgentInfo;
export declare function formatAgentStatus(info: AgentInfo): string;
export declare function formatHealthLog(options: {
    enrolled: boolean;
    agentName: string;
    agentId?: string;
    lastHeartbeatAt?: string | null;
    lastError?: string | null;
    status: AgentInfo["status"];
    dockerAvailable?: boolean;
}): string;
export declare function runAgent(options?: AgentRuntimeOptions): Promise<void>;
export declare function printHelp(): void;
export declare function run(): void;
export { AGENT_HEARTBEAT_INTERVAL_MS };
//# sourceMappingURL=index.d.ts.map