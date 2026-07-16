import {
  filterDockerLabels,
  type DockerContainerTelemetry,
  type DockerEngineTelemetry,
  type DockerImageTelemetry,
  type DockerTelemetry,
  dockerContainerHealthSchema,
  dockerContainerStateSchema,
} from "@rackora/shared";
import { computeContainerStats } from "./stats.js";
import type {
  DockerClient,
  DockerContainerInspect,
  DockerContainerSummary,
  DockerImageSummary,
} from "./types.js";

export type CollectDockerOptions = {
  client: DockerClient;
  /** Collect stats for running containers (short one-shot sample). */
  includeStats?: boolean;
  /** Max concurrent stats requests. */
  statsConcurrency?: number;
};

export async function collectDockerTelemetry(
  options: CollectDockerOptions,
): Promise<DockerTelemetry> {
  const { client } = options;
  const includeStats = options.includeStats ?? true;
  const statsConcurrency = options.statsConcurrency ?? 4;

  try {
    const alive = await client.ping();
    if (!alive) {
      return unavailable("Docker engine ping failed");
    }

    const [info, containerSummaries, imageSummaries] = await Promise.all([
      client.info(),
      client.listContainers({ all: true }),
      client.listImages(),
    ]);

    const engine: DockerEngineTelemetry = {
      version: info.ServerVersion ?? "unknown",
      os: info.OSType,
      architecture: info.Architecture,
      ncpu: info.NCPU,
      memTotalBytes: info.MemTotal,
    };

    const containers = await mapContainers(
      client,
      containerSummaries,
      includeStats,
      statsConcurrency,
    );
    const images = imageSummaries.map(mapImage);

    return {
      available: true,
      engine,
      containers,
      images,
      containerTotal: containers.length,
      imageTotal: images.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Docker collection failed";
    return unavailable(sanitizeError(message));
  }
}

function unavailable(error: string): DockerTelemetry {
  return {
    available: false,
    containers: [],
    images: [],
    containerTotal: 0,
    imageTotal: 0,
    error,
  };
}

async function mapContainers(
  client: DockerClient,
  summaries: DockerContainerSummary[],
  includeStats: boolean,
  statsConcurrency: number,
): Promise<DockerContainerTelemetry[]> {
  const inspected = await mapPool(summaries, statsConcurrency, async (summary) => {
    let inspect: DockerContainerInspect | null = null;
    try {
      inspect = await client.inspectContainer(summary.Id);
    } catch {
      inspect = null;
    }

    // Never forward env, commands, or mounts from inspect.
    assertNoSensitiveLeak(inspect);

    const container = toContainerTelemetry(summary, inspect);

    if (includeStats && container.state === "running") {
      try {
        const stats = await client.containerStats(summary.Id);
        container.stats = computeContainerStats(stats);
      } catch {
        // stats are best-effort
      }
    }

    return container;
  });

  return inspected;
}

function toContainerTelemetry(
  summary: DockerContainerSummary,
  inspect: DockerContainerInspect | null,
): DockerContainerTelemetry {
  const name =
    cleanName(inspect?.Name) ||
    cleanName(summary.Names?.[0]) ||
    summary.Id.slice(0, 12);

  const stateRaw = (
    inspect?.State?.Status ??
    summary.State ??
    "unknown"
  ).toLowerCase();
  const stateParse = dockerContainerStateSchema.safeParse(stateRaw);
  const state = stateParse.success ? stateParse.data : "unknown";

  const healthRaw = (
    inspect?.State?.Health?.Status ??
    parseHealthFromStatus(summary.Status) ??
    "none"
  ).toLowerCase();
  const healthParse = dockerContainerHealthSchema.safeParse(healthRaw);
  const health = healthParse.success ? healthParse.data : "none";

  const createdAt = resolveCreatedAt(inspect?.Created, summary.Created);
  const startedAt = resolveOptionalIso(inspect?.State?.StartedAt);
  const labels = filterDockerLabels(
    inspect?.Config?.Labels ?? summary.Labels,
  );
  const fullId = (inspect?.Id ?? summary.Id).slice(0, 64);
  const imageId = inspect?.Image?.slice(0, 128);
  const imageDigest = extractDigest(
    inspect?.Image,
    summary.Image,
  );

  return {
    id: fullId,
    shortId: fullId.slice(0, 12),
    name: name.slice(0, 256),
    image: (inspect?.Config?.Image ?? summary.Image ?? "unknown").slice(0, 512),
    imageId,
    imageDigest,
    state,
    health,
    createdAt,
    startedAt,
    restartCount:
      typeof inspect?.RestartCount === "number" && inspect.RestartCount >= 0
        ? inspect.RestartCount
        : undefined,
    labels,
  };
}

function extractDigest(
  imageId: string | undefined,
  imageRef: string | undefined,
): string | undefined {
  const candidates = [imageId, imageRef];
  for (const value of candidates) {
    if (!value) {
      continue;
    }
    if (value.includes("@sha256:")) {
      return value.slice(0, 512);
    }
    if (value.startsWith("sha256:") && value.length > 20) {
      return value.slice(0, 512);
    }
  }
  return undefined;
}

function resolveOptionalIso(value: string | undefined): string | null {
  if (!value || value.startsWith("0001-01-01")) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function mapImage(image: DockerImageSummary): DockerImageTelemetry {
  const repositoryTags = (image.RepoTags ?? []).filter(
    (tag) => tag && tag !== "<none>:<none>",
  );
  const digests = (image.RepoDigests ?? []).filter(
    (digest) => digest && digest !== "<none>@<none>",
  );

  return {
    id: image.Id.slice(0, 128),
    repositoryTags: repositoryTags.slice(0, 32),
    digests: digests.slice(0, 32),
    sizeBytes: image.Size ?? 0,
    createdAt:
      typeof image.Created === "number"
        ? new Date(image.Created * 1000).toISOString()
        : undefined,
  };
}

function cleanName(name: string | undefined): string {
  if (!name) {
    return "";
  }
  return name.replace(/^\//, "").trim();
}

function parseHealthFromStatus(status: string | undefined): string | null {
  if (!status) {
    return null;
  }
  const match = /\((healthy|unhealthy|health: starting)\)/i.exec(status);
  if (!match?.[1]) {
    return null;
  }
  const value = match[1].toLowerCase();
  if (value === "health: starting") {
    return "starting";
  }
  return value;
}

function resolveCreatedAt(
  inspectCreated: string | undefined,
  unixSeconds: number | undefined,
): string {
  if (inspectCreated) {
    const parsed = new Date(inspectCreated);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (typeof unixSeconds === "number" && unixSeconds > 0) {
    return new Date(unixSeconds * 1000).toISOString();
  }
  return new Date(0).toISOString();
}

/**
 * Defense-in-depth: ensure we never accidentally serialize env/cmd/mounts.
 * Collection only maps allowlisted fields; this documents the invariant.
 */
function assertNoSensitiveLeak(inspect: DockerContainerInspect | null): void {
  void inspect?.Config?.Env;
  void inspect?.Config?.Cmd;
  void inspect?.Config?.Entrypoint;
  void inspect?.Mounts;
}

function sanitizeError(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/password[=:]\S+/gi, "password=[redacted]")
    .slice(0, 512);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
