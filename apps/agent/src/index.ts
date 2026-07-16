#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_HEARTBEAT_INTERVAL_MS,
  type AgentInfo,
  type AgentTelemetryV1,
  agentInfoSchema,
  RACKORA_VERSION,
} from "@rackora/shared";
import { createBackoff, nextBackoffDelay, resetBackoff } from "./backoff.js";
import { createAgentHttpClient, type AgentHttpClient } from "./client.js";
import { loadAgentConfig, type AgentConfig } from "./config.js";
import {
  loadCredentials,
  saveCredentials,
  type AgentCredentials,
} from "./credentials.js";
import { createDockerSocketClient } from "./docker/client.js";
import type { DockerClient } from "./docker/types.js";
import {
  createTelemetryCollector,
  type TelemetryCollector,
} from "./telemetry/collect.js";

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

export function getAgentInfo(
  status: AgentInfo["status"] = "idle",
): AgentInfo {
  return agentInfoSchema.parse({
    name: "rackora-agent",
    version: RACKORA_VERSION,
    status,
  });
}

export function formatAgentStatus(info: AgentInfo): string {
  return `rackora-agent v${info.version} — status: ${info.status}`;
}

export function formatHealthLog(options: {
  enrolled: boolean;
  agentName: string;
  agentId?: string;
  lastHeartbeatAt?: string | null;
  lastError?: string | null;
  status: AgentInfo["status"];
  dockerAvailable?: boolean;
}): string {
  const info = getAgentInfo(options.status);
  const parts = [
    `rackora-agent health: status=${info.status}`,
    `version=${info.version}`,
    `name=${options.agentName}`,
    `enrolled=${options.enrolled}`,
  ];
  if (options.agentId) {
    parts.push(`agentId=${options.agentId}`);
  }
  if (options.dockerAvailable !== undefined) {
    parts.push(`docker=${options.dockerAvailable}`);
  }
  if (options.lastHeartbeatAt) {
    parts.push(`lastHeartbeat=${options.lastHeartbeatAt}`);
  }
  if (options.lastError) {
    parts.push(`lastError=${options.lastError}`);
  }
  return parts.join(" ");
}

async function ensureEnrolled(
  config: AgentConfig,
  client: AgentHttpClient,
): Promise<AgentCredentials> {
  const existing = loadCredentials(config.DATA_DIR);
  if (existing) {
    return existing;
  }

  if (!config.ENROLLMENT_TOKEN) {
    throw new Error(
      "No credentials in DATA_DIR and ENROLLMENT_TOKEN is not set",
    );
  }

  const enrolled = await client.enroll({
    coreUrl: config.CORE_URL,
    token: config.ENROLLMENT_TOKEN,
    name: config.AGENT_NAME,
  });

  const credentials: AgentCredentials = {
    agentId: enrolled.agentId,
    secret: enrolled.secret,
    name: enrolled.name,
    coreUrl: config.CORE_URL,
  };
  saveCredentials(config.DATA_DIR, credentials);
  return credentials;
}

function resolveDockerClient(
  options: AgentRuntimeOptions,
  config: AgentConfig,
): DockerClient | null {
  if (options.dockerClient !== undefined) {
    return options.dockerClient;
  }
  if (config.DOCKER_SOCKET === "") {
    return null;
  }
  return createDockerSocketClient({
    socketPath: config.DOCKER_SOCKET,
  });
}

export async function runAgent(
  options: AgentRuntimeOptions = {},
): Promise<void> {
  const log = options.log ?? ((message: string) => console.log(message));
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const client = options.client ?? createAgentHttpClient();
  const config = loadAgentConfig(options.env ?? process.env);
  const dockerClient = resolveDockerClient(options, config);
  const telemetry =
    options.telemetryCollector ??
    createTelemetryCollector({
      agentName: config.AGENT_NAME,
      agentVersion: RACKORA_VERSION,
      dockerClient,
      enableDocker: dockerClient !== null,
    });

  log(formatAgentStatus(getAgentInfo("idle")));
  log(
    formatHealthLog({
      enrolled: false,
      agentName: config.AGENT_NAME,
      status: "idle",
      dockerAvailable: dockerClient !== null,
    }),
  );

  const backoff = createBackoff();
  let credentials: AgentCredentials | null = null;
  let lastHeartbeatAt: string | null = null;
  let lastError: string | null = null;
  let iterations = 0;

  while (true) {
    if (
      options.maxIterations !== undefined &&
      iterations >= options.maxIterations
    ) {
      return;
    }
    iterations += 1;

    try {
      if (!credentials) {
        credentials = await ensureEnrolled(config, client);
        log(
          formatHealthLog({
            enrolled: true,
            agentName: credentials.name,
            agentId: credentials.agentId,
            status: "running",
            dockerAvailable: dockerClient !== null,
          }),
        );
      }

      let payload: AgentTelemetryV1;
      try {
        payload = await telemetry.collect();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Telemetry collection failed";
        log(`rackora-agent telemetry error: ${message}`);
        payload = await createMinimalTelemetry(credentials.name, sleep);
      }

      const status = payload.docker.available ? "ok" : "degraded";
      const result = await client.heartbeat({
        coreUrl: credentials.coreUrl,
        agentId: credentials.agentId,
        secret: credentials.secret,
        status,
        telemetry: payload,
      });

      lastHeartbeatAt = result.receivedAt;
      lastError = null;
      resetBackoff(backoff);
      log(
        formatHealthLog({
          enrolled: true,
          agentName: credentials.name,
          agentId: credentials.agentId,
          lastHeartbeatAt,
          status: "running",
          dockerAvailable: payload.docker.available,
        }),
      );
      log(
        [
          "rackora-agent telemetry:",
          payload.docker.available ? "Docker connected" : "Docker unavailable",
          `containers=${payload.docker.containerTotal}`,
          `host=${payload.host.hostname}`,
          `cpu=${payload.host.cpu.usagePercent}%`,
          payload.partial ? "partial=true" : "partial=false",
          "submitted=ok",
        ].join(" "),
      );

      await sleep(config.HEARTBEAT_INTERVAL_MS);
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Unknown agent failure";
      const delay = nextBackoffDelay(backoff);
      log(
        formatHealthLog({
          enrolled: credentials !== null,
          agentName: credentials?.name ?? config.AGENT_NAME,
          agentId: credentials?.agentId,
          lastHeartbeatAt,
          lastError,
          status: "error",
          dockerAvailable: dockerClient !== null,
        }),
      );
      log(`rackora-agent backoff: retry in ${delay}ms`);
      await sleep(delay);
    }
  }
}

async function createMinimalTelemetry(
  agentName: string,
  sleep: (ms: number) => Promise<void>,
): Promise<AgentTelemetryV1> {
  const { collectHostTelemetry } = await import("./host/collect.js");
  const { buildAgentTelemetry } = await import("./telemetry/build.js");
  const host = await collectHostTelemetry({
    sleep,
    cpuSampleMs: 50,
  });
  return buildAgentTelemetry({
    agentName,
    agentVersion: RACKORA_VERSION,
    host,
    docker: {
      available: false,
      containers: [],
      images: [],
      containerTotal: 0,
      imageTotal: 0,
      error: "Telemetry collection failed",
    },
  });
}

export function printHelp(): void {
  console.log(`rackora-agent v${RACKORA_VERSION}

Read-only Docker and host telemetry agent for Rackora.

Usage:
  rackora-agent
  rackora-agent --help

Environment:
  CORE_URL                 Rackora core base URL (required)
  AGENT_NAME               Agent name (required)
  DATA_DIR                 Local data directory for credentials (required)
                           Alias: AGENT_DATA_DIR
  ENROLLMENT_TOKEN         One-time enrollment token (required on first run)
  HEARTBEAT_INTERVAL_MS    Heartbeat interval in ms (default: ${AGENT_HEARTBEAT_INTERVAL_MS})
                           Alias: TELEMETRY_INTERVAL_SECONDS (seconds)
  DOCKER_SOCKET            Docker engine socket path (default: /var/run/docker.sock)
                           Set empty to disable Docker collection
  HOST_ROOT                Host mount prefix (default: auto-detect /host or /)
  HOST_ROOTFS              Host root filesystem mount for disk stats
                           (default: /host/root when present)

The agent enrolls once, stores credentials in DATA_DIR, and sends signed
heartbeats with host and Docker telemetry. No remote commands are accepted.
`);
}

export function run(): void {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  void runAgent().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Agent failed to start",
    );
    process.exit(1);
  });
}

const entry = process.argv[1];
if (
  entry !== undefined &&
  path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url))
) {
  run();
}

export { AGENT_HEARTBEAT_INTERVAL_MS };
