import type { ProxmoxRawSnapshot } from "./types.js";

/** Private IP avoids DNS during SSRF checks in unit tests. */
export const FIXTURE_BASE_URL = "https://192.168.5.10:8006";

export const fixtureVersion = {
  version: "8.2.2",
  release: "8.2",
  repoid: "abc123",
};

export const fixtureNodes = [
  {
    node: "pve1",
    status: "online",
    cpu: 0.21,
    maxcpu: 8,
    mem: 8 * 1024 ** 3,
    maxmem: 32 * 1024 ** 3,
    uptime: 86400,
  },
  {
    node: "pve2",
    status: "online",
    cpu: 0.45,
    maxcpu: 16,
    mem: 24 * 1024 ** 3,
    maxmem: 64 * 1024 ** 3,
    uptime: 43200,
  },
];

export const fixtureResources = [
  {
    id: "qemu/100",
    type: "qemu",
    node: "pve1",
    vmid: 100,
    name: "docker-host",
    status: "running",
    uptime: 86000,
    cpu: 0.12,
    maxcpu: 4,
    mem: 4 * 1024 ** 3,
    maxmem: 8 * 1024 ** 3,
  },
  {
    id: "lxc/101",
    type: "lxc",
    node: "pve1",
    vmid: 101,
    name: "home-assistant",
    status: "running",
    uptime: 80000,
    cpu: 0.05,
    maxcpu: 2,
    mem: 1 * 1024 ** 3,
    maxmem: 2 * 1024 ** 3,
  },
  {
    id: "qemu/200",
    type: "qemu",
    node: "pve2",
    vmid: 200,
    name: "nas",
    status: "stopped",
    uptime: 0,
    cpu: 0,
    maxcpu: 2,
    mem: 0,
    maxmem: 4 * 1024 ** 3,
  },
  {
    id: "qemu/201",
    type: "qemu",
    node: "pve2",
    vmid: 201,
    name: "template-ubuntu",
    status: "stopped",
    template: 1,
    cpu: 0,
    maxcpu: 1,
    mem: 0,
    maxmem: 1024 ** 3,
  },
];

export const fixtureNodeStatus = {
  pve1: {
    uptime: 86400,
    cpu: 0.21,
    memory: { used: 8 * 1024 ** 3, total: 32 * 1024 ** 3 },
    rootfs: { used: 40 * 1024 ** 3, total: 100 * 1024 ** 3 },
  },
  pve2: {
    uptime: 43200,
    cpu: 0.45,
    memory: { used: 24 * 1024 ** 3, total: 64 * 1024 ** 3 },
    rootfs: { used: 70 * 1024 ** 3, total: 100 * 1024 ** 3 },
  },
};

export const fixtureStorages = {
  pve1: [
    {
      storage: "local-lvm",
      type: "lvmthin",
      content: "images,rootdir",
      active: 1,
      enabled: 1,
      used: 40 * 1024 ** 3,
      total: 100 * 1024 ** 3,
    },
  ],
  pve2: [
    {
      storage: "tank",
      type: "zfspool",
      content: "images",
      active: 1,
      enabled: 1,
      used: 70 * 1024 ** 3,
      total: 100 * 1024 ** 3,
    },
  ],
};

export const fixtureRawSnapshot: ProxmoxRawSnapshot = {
  version: fixtureVersion,
  resources: fixtureResources,
  nodes: fixtureNodes,
  nodeStatus: fixtureNodeStatus,
  storages: fixtureStorages,
  clusterStorage: [],
  nodeGuests: {
    pve1: {
      qemu: fixtureResources.filter((r) => r.type === "qemu" && r.node === "pve1") as never,
      lxc: fixtureResources.filter((r) => r.type === "lxc" && r.node === "pve1") as never,
    },
    pve2: {
      qemu: fixtureResources.filter((r) => r.type === "qemu" && r.node === "pve2") as never,
      lxc: [],
    },
  },
  collectionStatus: "complete",
  warnings: [],
};

/** Partial / messy payload — missing fields should not crash normalize. */
export const fixturePartialRaw: ProxmoxRawSnapshot = {
  version: {},
  resources: [
    { type: "node", node: "lonely", status: "online", maxcpu: 4, cpu: 0.1, mem: 1024, maxmem: 8192 },
    { type: "qemu", node: "lonely", vmid: 50, status: "running", name: "guest-50" },
    { type: "lxc" },
  ],
  nodes: [{ node: "lonely", status: "online" }],
  nodeStatus: {},
  storages: {},
  clusterStorage: [],
  nodeGuests: { lonely: { qemu: [{ vmid: 50, name: "guest-50", status: "running" }], lxc: [] } },
  collectionStatus: "partial",
  warnings: [{ scope: "node", target: "lonely", message: "Node status unavailable" }],
};

export function envelope<T>(data: T): string {
  return JSON.stringify({ data });
}

export type MockRoute = {
  status: number;
  body?: string;
  delayMs?: number;
  tlsError?: "self-signed";
};

/**
 * Build a fetch mock that routes Proxmox API paths to fixtures.
 * Supports 401, timeout (via AbortSignal), and TLS failure simulation.
 */
export function createProxmoxFetchMock(
  routes: Record<string, MockRoute>,
): typeof fetch {
  return (async (input: string | URL | { url?: string; toString(): string }, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input.url ?? input.toString());
    const path = new URL(url).pathname;

    const route = routes[path];
    if (!route) {
      return new Response(JSON.stringify({ data: null }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (route.tlsError === "self-signed") {
      const error = new Error("self signed certificate");
      (error as NodeJS.ErrnoException).code = "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
      throw error;
    }

    if (route.delayMs && route.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, route.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const abortError = new Error("The operation was aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      });
    }

    return new Response(route.body ?? envelope(null), {
      status: route.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

export function createSuccessFetchMock(): typeof fetch {
  const nodeResources = fixtureNodes.map((node) => ({
    id: `node/${node.node}`,
    type: "node",
    node: node.node,
    status: node.status,
    cpu: node.cpu,
    maxcpu: node.maxcpu,
    mem: node.mem,
    maxmem: node.maxmem,
    uptime: node.uptime,
  }));

  return createProxmoxFetchMock({
    "/api2/json/version": { status: 200, body: envelope(fixtureVersion) },
    "/api2/json/cluster/resources": {
      status: 200,
      body: envelope([...nodeResources, ...fixtureResources]),
    },
    "/api2/json/cluster/resources?type=vm": {
      status: 200,
      body: envelope(fixtureResources.filter((r) => r.type === "qemu" || r.type === "lxc")),
    },
    "/api2/json/cluster/resources?type=storage": {
      status: 200,
      body: envelope([]),
    },
    "/api2/json/cluster/resources?type=node": {
      status: 200,
      body: envelope(nodeResources),
    },
    "/api2/json/nodes": { status: 200, body: envelope(fixtureNodes) },
    "/api2/json/storage": { status: 200, body: envelope([]) },
    "/api2/json/nodes/pve1/status": {
      status: 200,
      body: envelope(fixtureNodeStatus.pve1),
    },
    "/api2/json/nodes/pve2/status": {
      status: 200,
      body: envelope(fixtureNodeStatus.pve2),
    },
    "/api2/json/nodes/pve1/storage": {
      status: 200,
      body: envelope(fixtureStorages.pve1),
    },
    "/api2/json/nodes/pve2/storage": {
      status: 200,
      body: envelope(fixtureStorages.pve2),
    },
    "/api2/json/nodes/pve1/qemu": {
      status: 200,
      body: envelope(fixtureResources.filter((r) => r.type === "qemu" && r.node === "pve1")),
    },
    "/api2/json/nodes/pve1/lxc": {
      status: 200,
      body: envelope(fixtureResources.filter((r) => r.type === "lxc" && r.node === "pve1")),
    },
    "/api2/json/nodes/pve2/qemu": {
      status: 200,
      body: envelope(fixtureResources.filter((r) => r.type === "qemu" && r.node === "pve2")),
    },
    "/api2/json/nodes/pve2/lxc": {
      status: 200,
      body: envelope([]),
    },
  });
}
