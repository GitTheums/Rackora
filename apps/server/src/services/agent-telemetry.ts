import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  agentTelemetrySchema,
  agentTelemetryStateResponseSchema,
  type AgentHeartbeatRequest,
  type AgentMetricSample,
  type AgentTelemetry,
  type AgentTelemetryStateResponse,
} from "@rackora/shared";
import type { RackoraDatabase } from "../db/client.js";
import { agentMetricSamples, agentTelemetryState } from "../db/schema.js";

export async function persistAgentTelemetry(
  db: RackoraDatabase,
  agentId: string,
  body: AgentHeartbeatRequest,
  now: Date = new Date(),
): Promise<void> {
  if (!body.telemetry) {
    return;
  }

  const telemetry = agentTelemetrySchema.parse(body.telemetry);
  const collectedAt = new Date(telemetry.collectedAt);

  await db
    .insert(agentTelemetryState)
    .values({
      agentId,
      schemaVersion: telemetry.schemaVersion,
      collectedAt,
      status: body.status,
      payloadJson: JSON.stringify(telemetry),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentTelemetryState.agentId,
      set: {
        schemaVersion: telemetry.schemaVersion,
        collectedAt,
        status: body.status,
        payloadJson: JSON.stringify(telemetry),
        updatedAt: now,
      },
    });

  const samples = extractMetricSamples(telemetry);
  if (samples.length === 0) {
    return;
  }

  await db.insert(agentMetricSamples).values(
    samples.map((sample) => ({
      id: randomUUID(),
      agentId,
      collectedAt: new Date(sample.collectedAt),
      metricKey: sample.metricKey,
      value: sample.value,
      labelsJson: sample.labels ? JSON.stringify(sample.labels) : null,
    })),
  );
}

export async function getAgentTelemetryState(
  db: RackoraDatabase,
  agentId: string,
): Promise<AgentTelemetryStateResponse | null> {
  const row = await db.query.agentTelemetryState.findFirst({
    where: eq(agentTelemetryState.agentId, agentId),
  });

  if (!row) {
    return null;
  }

  const telemetry = agentTelemetrySchema.parse(
    JSON.parse(row.payloadJson) as unknown,
  );

  return agentTelemetryStateResponseSchema.parse({
    agentId: row.agentId,
    schemaVersion: row.schemaVersion,
    collectedAt: row.collectedAt.toISOString(),
    status: row.status,
    telemetry,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listAgentMetricSamples(
  db: RackoraDatabase,
  agentId: string,
  limit = 100,
): Promise<
  Array<{
    metricKey: string;
    value: number;
    labels: Record<string, string> | null;
    collectedAt: string;
  }>
> {
  const rows = await db
    .select()
    .from(agentMetricSamples)
    .where(eq(agentMetricSamples.agentId, agentId))
    .orderBy(desc(agentMetricSamples.collectedAt))
    .limit(limit);

  return rows.map((row) => ({
    metricKey: row.metricKey,
    value: row.value,
    labels: row.labelsJson
      ? (JSON.parse(row.labelsJson) as Record<string, string>)
      : null,
    collectedAt: row.collectedAt.toISOString(),
  }));
}

export function extractMetricSamples(
  telemetry: AgentTelemetry,
): AgentMetricSample[] {
  const collectedAt = telemetry.collectedAt;
  const samples: AgentMetricSample[] = [
    {
      metricKey: "host.cpu.usage_percent",
      value: telemetry.host.cpu.usagePercent,
      collectedAt,
    },
    {
      metricKey: "host.memory.used_bytes",
      value: telemetry.host.memory.usedBytes,
      collectedAt,
    },
    {
      metricKey: "host.memory.total_bytes",
      value: telemetry.host.memory.totalBytes,
      collectedAt,
    },
    {
      metricKey: "host.cpu.load_1",
      value: telemetry.host.cpu.loadAverage[0],
      collectedAt,
    },
  ];

  for (const filesystem of telemetry.host.filesystems) {
    samples.push({
      metricKey: "host.filesystem.used_bytes",
      value: filesystem.usedBytes,
      labels: { mountpoint: filesystem.mountpoint },
      collectedAt,
    });
  }

  for (const temperature of telemetry.host.temperatures) {
    samples.push({
      metricKey: "host.temperature.celsius",
      value: temperature.celsius,
      labels: { name: temperature.name, source: temperature.source },
      collectedAt,
    });
  }

  if (telemetry.docker.available) {
    samples.push({
      metricKey: "docker.containers.total",
      value: telemetry.docker.containerTotal,
      collectedAt,
    });
    samples.push({
      metricKey: "docker.images.total",
      value: telemetry.docker.imageTotal,
      collectedAt,
    });

    for (const container of telemetry.docker.containers) {
      if (!container.stats) {
        continue;
      }
      samples.push({
        metricKey: "docker.container.cpu_percent",
        value: container.stats.cpuPercent,
        labels: { id: container.id.slice(0, 12), name: container.name },
        collectedAt,
      });
      samples.push({
        metricKey: "docker.container.memory_used_bytes",
        value: container.stats.memoryUsageBytes,
        labels: { id: container.id.slice(0, 12), name: container.name },
        collectedAt,
      });
      samples.push({
        metricKey: "docker.container.net_rx_bytes",
        value: container.stats.netRxBytes,
        labels: { id: container.id.slice(0, 12), name: container.name },
        collectedAt,
      });
      samples.push({
        metricKey: "docker.container.net_tx_bytes",
        value: container.stats.netTxBytes,
        labels: { id: container.id.slice(0, 12), name: container.name },
        collectedAt,
      });
      samples.push({
        metricKey: "docker.container.block_read_bytes",
        value: container.stats.blockReadBytes,
        labels: { id: container.id.slice(0, 12), name: container.name },
        collectedAt,
      });
      samples.push({
        metricKey: "docker.container.block_write_bytes",
        value: container.stats.blockWriteBytes,
        labels: { id: container.id.slice(0, 12), name: container.name },
        collectedAt,
      });
    }
  }

  return samples;
}
