import { describe, expect, it } from "vitest";
import type { Node } from "@rackora/shared";
import { formatCpuUsage } from "@rackora/shared";
import { normalizeProxmoxSnapshot } from "../integrations/proxmox/normalize.js";
import { fixtureRawSnapshot } from "../integrations/proxmox/fixtures.js";
import {
  aggregateCpu,
  aggregateMemory,
  aggregateStorage,
  aggregateWorkloads,
  computeNodeHealth,
  dedupeStoragePools,
} from "./proxmox-overview.js";

describe("proxmox overview aggregation", () => {
  const infrastructure = normalizeProxmoxSnapshot(fixtureRawSnapshot);

  it("normalizes nodes, guests and storage from fixtures", () => {
    expect(infrastructure.nodes.map((node) => node.name).sort()).toEqual([
      "pve1",
      "pve2",
    ]);
    expect(infrastructure.cluster?.version).toBe("8.2.2");
    expect(
      infrastructure.nodes.flatMap((node) => node.guests).length,
    ).toBeGreaterThan(0);
  });

  it("does not treat stopped VMs as offline nodes", () => {
    const health = computeNodeHealth(infrastructure.nodes);
    expect(health).toBe("healthy");
    expect(infrastructure.nodes.every((node) => node.state !== "down")).toBe(
      true,
    );

    const summary = aggregateWorkloads(infrastructure.nodes);
    expect(summary.nodesOnline).toBe(2);
    expect(summary.workloadsStopped).toBeGreaterThan(0);
  });

  it("aggregates CPU as a weighted average across online nodes", () => {
    const cpu = aggregateCpu(infrastructure.nodes);
    expect(cpu.cores).toBe(24);
    expect(cpu.usageRatio).toBeCloseTo((0.21 * 8 + 0.45 * 16) / 24);
    expect(cpu.usagePercent).toBeCloseTo(cpu.usageRatio! * 100);
    expect(cpu.available).toBe(true);
    expect(formatCpuUsage({
      ratio: cpu.usageRatio,
      percent: cpu.usagePercent,
      available: cpu.available,
    })).toBe("37%");
  });

  it("excludes offline nodes from CPU aggregation", () => {
    const offlineNode: Node = {
      ...infrastructure.nodes[0]!,
      state: "down",
      cpuRatio: 0.99,
      cpuPercent: 99,
      cpuCount: 32,
    };
    const cpu = aggregateCpu([offlineNode, infrastructure.nodes[1]!]);
    expect(cpu.usageRatio).toBeCloseTo(0.45);
    expect(cpu.cores).toBe(16);
  });

  it("does not divide CPU ratios by 100 twice", () => {
    const node: Node = {
      id: "node:pve",
      name: "pve",
      state: "healthy",
      cpuRatio: 0.042,
      cpuPercent: 4.2,
      memoryPercent: 0,
      storagePercent: 0,
      uptimeSeconds: 0,
      guests: [],
      cpuCount: 4,
    };
    const cpu = aggregateCpu([node]);
    expect(cpu.usageRatio).toBe(0.042);
    expect(cpu.usagePercent).toBeCloseTo(4.2);
    expect(formatCpuUsage({ ratio: cpu.usageRatio, available: true })).toBe("4.2%");
  });

  it("aggregates memory safely with totals", () => {
    const memory = aggregateMemory(infrastructure.nodes);
    expect(memory.totalBytes).toBeGreaterThan(0);
    expect(memory.usedBytes).toBeLessThanOrEqual(memory.totalBytes);
    expect(memory.available).toBe(true);
  });

  it("deduplicates shared storage pools", () => {
    const sharedNode: Node = {
      id: "node:pve3",
      name: "pve3",
      state: "healthy",
      cpuPercent: 10,
      memoryPercent: 20,
      storagePercent: 30,
      uptimeSeconds: 1000,
      guests: [],
      storages: [
        {
          id: "storage:pve3:local-lvm",
          name: "local-lvm",
          node: "pve3",
          type: "lvm",
          usedBytes: 100,
          totalBytes: 1000,
          usagePercent: 10,
          state: "healthy",
        },
      ],
    };

    const duplicateNode: Node = {
      ...sharedNode,
      id: "node:pve4",
      name: "pve4",
      storages: [
        {
          id: "storage:pve4:local-lvm",
          name: "local-lvm",
          node: "pve4",
          type: "lvm",
          usedBytes: 100,
          totalBytes: 1000,
          usagePercent: 10,
          state: "healthy",
        },
      ],
    };

    const pools = dedupeStoragePools([sharedNode, duplicateNode]);
    expect(pools).toHaveLength(1);

    const storage = aggregateStorage([sharedNode, duplicateNode]);
    expect(storage.totalBytes).toBe(1000);
    expect(storage.available).toBe(true);
  });

  it("marks metrics unavailable when byte totals are missing", () => {
    const cpu = aggregateCpu([]);
    const memory = aggregateMemory([]);
    expect(cpu.available).toBe(false);
    expect(memory.available).toBe(false);
  });

  it("marks health degraded when a node is offline", () => {
    const offlineNode: Node = {
      ...infrastructure.nodes[0]!,
      state: "down",
    };
    expect(computeNodeHealth([offlineNode, infrastructure.nodes[1]!])).toBe(
      "degraded",
    );
  });
});
