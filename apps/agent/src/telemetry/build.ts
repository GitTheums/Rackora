import {
  AGENT_TELEMETRY_MAX_BYTES,
  AGENT_TELEMETRY_MAX_CONTAINERS,
  AGENT_TELEMETRY_MAX_IMAGES,
  TELEMETRY_SCHEMA_VERSION,
  agentTelemetryV1Schema,
  jsonByteLength,
  type AgentTelemetryV1,
  type DockerTelemetry,
  type HostTelemetry,
} from "@rackora/shared";

export type TelemetryBatchState = {
  containerOffset: number;
  imageOffset: number;
};

export function createTelemetryBatchState(): TelemetryBatchState {
  return {
    containerOffset: 0,
    imageOffset: 0,
  };
}

export type BuildTelemetryOptions = {
  agentName: string;
  agentVersion: string;
  collectedAt?: string;
  host: HostTelemetry;
  docker: DockerTelemetry;
  batchState?: TelemetryBatchState;
  maxBytes?: number;
  maxContainers?: number;
  maxImages?: number;
};

export function buildAgentTelemetry(
  options: BuildTelemetryOptions,
): AgentTelemetryV1 {
  const maxBytes = options.maxBytes ?? AGENT_TELEMETRY_MAX_BYTES;
  const maxContainers =
    options.maxContainers ?? AGENT_TELEMETRY_MAX_CONTAINERS;
  const maxImages = options.maxImages ?? AGENT_TELEMETRY_MAX_IMAGES;
  const batchState = options.batchState ?? createTelemetryBatchState();

  const allContainers = options.docker.containers;
  const allImages = options.docker.images;
  const containerTotal = options.docker.containerTotal ?? allContainers.length;
  const imageTotal = options.docker.imageTotal ?? allImages.length;

  const containerBatchTotal = Math.max(
    1,
    Math.ceil(Math.max(allContainers.length, 1) / maxContainers),
  );
  const imageBatchTotal = Math.max(
    1,
    Math.ceil(Math.max(allImages.length, 1) / maxImages),
  );
  const batchTotal = Math.max(containerBatchTotal, imageBatchTotal);

  const containerOffset =
    allContainers.length === 0
      ? 0
      : batchState.containerOffset % allContainers.length;
  const imageOffset =
    allImages.length === 0 ? 0 : batchState.imageOffset % allImages.length;

  let containers = allContainers.slice(
    containerOffset,
    containerOffset + maxContainers,
  );
  let images = allImages.slice(imageOffset, imageOffset + maxImages);

  // Advance offsets for the next heartbeat.
  if (allContainers.length > 0) {
    batchState.containerOffset =
      (containerOffset + containers.length) % allContainers.length;
  }
  if (allImages.length > 0) {
    batchState.imageOffset =
      (imageOffset + images.length) % allImages.length;
  }

  const batchIndex =
    allContainers.length > maxContainers
      ? Math.floor(containerOffset / maxContainers) % batchTotal
      : 0;

  let payload: AgentTelemetryV1 = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    collectedAt: options.collectedAt ?? new Date().toISOString(),
    agent: {
      name: options.agentName,
      version: options.agentVersion,
    },
    host: options.host,
    docker: {
      ...options.docker,
      containers,
      images,
      containerTotal,
      imageTotal,
    },
    batch: {
      index: batchIndex,
      total: batchTotal,
      truncated: false,
    },
    partial: Boolean(options.docker.error) || batchTotal > 1,
    warnings: options.docker.error ? [options.docker.error] : undefined,
  };

  // Fit under the hard payload limit by dropping stats, then truncating lists.
  if (jsonByteLength(payload) > maxBytes) {
    containers = containers.map((container) => {
      const { stats: _stats, ...rest } = container;
      return rest;
    });
    payload = {
      ...payload,
      docker: {
        ...payload.docker,
        containers,
      },
      batch: {
        index: batchIndex,
        total: batchTotal,
        truncated: true,
      },
    };
  }

  while (jsonByteLength(payload) > maxBytes && containers.length > 1) {
    containers = containers.slice(0, Math.max(1, Math.floor(containers.length / 2)));
    payload = {
      ...payload,
      docker: {
        ...payload.docker,
        containers,
      },
      batch: {
        index: batchIndex,
        total: batchTotal,
        truncated: true,
      },
    };
  }

  while (jsonByteLength(payload) > maxBytes && images.length > 0) {
    images = images.slice(0, Math.max(0, Math.floor(images.length / 2)));
    payload = {
      ...payload,
      docker: {
        ...payload.docker,
        images,
      },
      batch: {
        index: batchIndex,
        total: batchTotal,
        truncated: true,
      },
    };
  }

  if (jsonByteLength(payload) > maxBytes) {
    payload = {
      ...payload,
      docker: {
        available: payload.docker.available,
        engine: payload.docker.engine,
        containers: [],
        images: [],
        containerTotal,
        imageTotal,
        error: payload.docker.error ?? "Telemetry truncated to fit payload limit",
      },
      batch: {
        index: batchIndex,
        total: batchTotal,
        truncated: true,
      },
    };
  }

  return agentTelemetryV1Schema.parse(payload);
}
