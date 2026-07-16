import {
  RACKORA_VERSION,
  type AgentTelemetryV1,
} from "@rackora/shared";
import { collectDockerTelemetry } from "../docker/collect.js";
import type { DockerClient } from "../docker/types.js";
import { collectHostTelemetry, type CollectHostOptions } from "../host/collect.js";
import {
  buildAgentTelemetry,
  createTelemetryBatchState,
  type TelemetryBatchState,
} from "./build.js";

export type TelemetryCollector = {
  collect: () => Promise<AgentTelemetryV1>;
};

export type CreateTelemetryCollectorOptions = {
  agentName: string;
  agentVersion?: string;
  dockerClient?: DockerClient | null;
  hostOptions?: CollectHostOptions;
  batchState?: TelemetryBatchState;
  /** When false, skip docker entirely. */
  enableDocker?: boolean;
};

export function createTelemetryCollector(
  options: CreateTelemetryCollectorOptions,
): TelemetryCollector {
  const batchState = options.batchState ?? createTelemetryBatchState();
  const enableDocker = options.enableDocker ?? true;

  return {
    async collect() {
      const host = await collectHostTelemetry(options.hostOptions);

      const docker =
        enableDocker && options.dockerClient
          ? await collectDockerTelemetry({
              client: options.dockerClient,
              includeStats: true,
            })
          : {
              available: false,
              containers: [],
              images: [],
              containerTotal: 0,
              imageTotal: 0,
              error: enableDocker
                ? "Docker client not configured"
                : "Docker telemetry disabled",
            };

      return buildAgentTelemetry({
        agentName: options.agentName,
        agentVersion: options.agentVersion ?? RACKORA_VERSION,
        host,
        docker,
        batchState,
      });
    },
  };
}
