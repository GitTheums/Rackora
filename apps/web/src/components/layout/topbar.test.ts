import { describe, expect, it } from "vitest";
import type { DashboardOverview } from "@rackora/shared";
import { deriveOverallHealth } from "./topbar";

const connectedHealthy: DashboardOverview = {
  proxmox: {
    connected: true,
    stale: false,
    partial: false,
    integrationId: "00000000-0000-4000-8000-000000000001",
    integrationName: "Home",
    collectedAt: new Date().toISOString(),
    healthStatus: "healthy",
    lastError: null,
    systems: { healthy: 2, total: 2 },
    cpu: {
      usagePercent: 20,
      cores: 8,
      available: true,
      historyAvailable: false,
      history: [],
    },
    memory: {
      usedBytes: 1,
      totalBytes: 2,
      usagePercent: 50,
      available: true,
      historyAvailable: false,
      history: [],
    },
    storage: {
      usedBytes: 1,
      totalBytes: 2,
      usagePercent: 50,
      available: true,
      pools: [],
    },
    summary: {
      nodesTotal: 2,
      nodesOnline: 2,
      nodesOffline: 0,
      qemuTotal: 1,
      lxcTotal: 1,
      workloadsRunning: 2,
      workloadsStopped: 0,
    },
    warnings: [],
    syncEvents: [],
  },
};

describe("deriveOverallHealth", () => {
  it("reports healthy when proxmox is connected and all nodes are online", () => {
    const result = deriveOverallHealth(connectedHealthy);
    expect(result.state).toBe("healthy");
    expect(result.label).toBe("All systems operational");
  });

  it("reports degraded when proxmox health is degraded", () => {
    const proxmox = connectedHealthy.proxmox;
    if (!proxmox.connected) {
      throw new Error("expected connected proxmox fixture");
    }
    const result = deriveOverallHealth({
      ...connectedHealthy,
      proxmox: {
        ...proxmox,
        healthStatus: "degraded",
      },
    });
    expect(result.state).toBe("degraded");
    expect(result.label).toBe("Minor issues");
  });

  it("reports down when proxmox is not connected", () => {
    const result = deriveOverallHealth({
      proxmox: {
        connected: false,
        message: "No Proxmox integration configured",
      },
    });
    expect(result.state).toBe("down");
    expect(result.label).toBe("Proxmox not connected");
  });

  it("reports stale label when proxmox data is stale", () => {
    const proxmox = connectedHealthy.proxmox;
    if (!proxmox.connected) {
      throw new Error("expected connected proxmox fixture");
    }
    const result = deriveOverallHealth({
      ...connectedHealthy,
      proxmox: {
        ...proxmox,
        stale: true,
        healthStatus: "degraded",
      },
    });
    expect(result.state).toBe("degraded");
    expect(result.label).toBe("Data may be stale");
  });
});
