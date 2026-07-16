import type { ProxmoxConfig } from "@rackora/shared";
import {
  HttpRequestError,
  safeFetch,
  type FetchLike,
} from "../http.js";
import { redactUrl } from "../ssrf.js";
import type {
  CollectionWarning,
  ProxmoxClusterResource,
  ProxmoxGuestListItem,
  ProxmoxNodeListItem,
  ProxmoxNodeStatus,
  ProxmoxRawSnapshot,
  ProxmoxStorage,
  ProxmoxVersion,
} from "./types.js";

export type ProxmoxClientOptions = {
  allowInsecureTls: boolean;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

type ApiEnvelope<T> = {
  data?: T;
};

function authHeader(config: ProxmoxConfig): string {
  return `PVEAPIToken=${config.tokenId}=${config.tokenSecret}`;
}

function apiBase(config: ProxmoxConfig): string {
  return config.baseUrl.replace(/\/+$/, "");
}

function resourceKey(resource: ProxmoxClusterResource): string {
  return resource.id ?? `${resource.type ?? "unknown"}:${resource.node ?? ""}:${resource.vmid ?? ""}:${resource.storage ?? ""}`;
}

function guestToResource(
  node: string,
  guest: ProxmoxGuestListItem,
  type: "qemu" | "lxc",
): ProxmoxClusterResource {
  return {
    id: `${type}/${guest.vmid ?? 0}`,
    type,
    node,
    vmid: guest.vmid,
    name: guest.name,
    status: guest.status,
    uptime: guest.uptime,
    cpu: guest.cpu,
    maxcpu: guest.cpus ?? guest.maxcpu,
    mem: guest.mem,
    maxmem: guest.maxmem,
    disk: guest.disk,
    maxdisk: guest.maxdisk,
    template: guest.template,
  };
}

export class ProxmoxClient {
  constructor(
    private readonly config: ProxmoxConfig,
    private readonly options: ProxmoxClientOptions,
  ) {}

  private async getJson<T>(path: string): Promise<T> {
    const url = `${apiBase(this.config)}${path}`;

    let response: Response;
    try {
      response = await safeFetch(url, {
        method: "GET",
        headers: {
          Authorization: authHeader(this.config),
          Accept: "application/json",
        },
        tlsMode: this.config.tlsMode,
        customCa: this.config.customCa,
        allowInsecureTls: this.options.allowInsecureTls,
        fetchImpl: this.options.fetchImpl,
        timeoutMs: this.options.timeoutMs,
      });
    } catch (error) {
      if (error instanceof HttpRequestError) {
        throw error;
      }
      throw new HttpRequestError("Proxmox request failed", undefined, {
        cause: error,
      });
    }

    if (response.status === 401 || response.status === 403) {
      throw new HttpRequestError("Proxmox authentication failed", response.status);
    }

    if (!response.ok) {
      throw new HttpRequestError(
        `Proxmox API error (${response.status}) for ${redactUrl(url)}`,
        response.status,
      );
    }

    const body = (await response.json()) as ApiEnvelope<T>;
    if (body.data === undefined) {
      throw new HttpRequestError("Proxmox response missing data field");
    }
    return body.data;
  }

  /** GET that returns null on 403 instead of throwing — for optional endpoints. */
  private async getJsonOptional<T>(path: string): Promise<{ data: T | null; status: number; forbidden: boolean }> {
    const url = `${apiBase(this.config)}${path}`;

    let response: Response;
    try {
      response = await safeFetch(url, {
        method: "GET",
        headers: {
          Authorization: authHeader(this.config),
          Accept: "application/json",
        },
        tlsMode: this.config.tlsMode,
        customCa: this.config.customCa,
        allowInsecureTls: this.options.allowInsecureTls,
        fetchImpl: this.options.fetchImpl,
        timeoutMs: this.options.timeoutMs,
      });
    } catch (error) {
      if (error instanceof HttpRequestError) {
        throw error;
      }
      throw new HttpRequestError("Proxmox request failed", undefined, {
        cause: error,
      });
    }

    if (response.status === 403) {
      return { data: null, status: 403, forbidden: true };
    }

    if (response.status === 401) {
      throw new HttpRequestError("Proxmox authentication failed", response.status);
    }

    if (!response.ok) {
      throw new HttpRequestError(
        `Proxmox API error (${response.status}) for ${redactUrl(url)}`,
        response.status,
      );
    }

    const body = (await response.json()) as ApiEnvelope<T>;
    return { data: body.data ?? null, status: response.status, forbidden: false };
  }

  async getVersion(): Promise<ProxmoxVersion> {
    return this.getJson<ProxmoxVersion>("/api2/json/version");
  }

  async getClusterResources(type?: "vm" | "storage" | "node" | "sdn"): Promise<ProxmoxClusterResource[]> {
    const query = type ? `?type=${type}` : "";
    return this.getJson<ProxmoxClusterResource[]>(`/api2/json/cluster/resources${query}`);
  }

  async getNodes(): Promise<ProxmoxNodeListItem[]> {
    return this.getJson<ProxmoxNodeListItem[]>("/api2/json/nodes");
  }

  async getNodeStatus(node: string): Promise<ProxmoxNodeStatus | null> {
    const encoded = encodeURIComponent(node);
    const result = await this.getJsonOptional<ProxmoxNodeStatus>(
      `/api2/json/nodes/${encoded}/status`,
    );
    return result.data;
  }

  async getNodeStorage(node: string): Promise<ProxmoxStorage[]> {
    const encoded = encodeURIComponent(node);
    const result = await this.getJsonOptional<ProxmoxStorage[]>(
      `/api2/json/nodes/${encoded}/storage`,
    );
    return result.data ?? [];
  }

  async getClusterStorage(): Promise<ProxmoxStorage[]> {
    const result = await this.getJsonOptional<ProxmoxStorage[]>("/api2/json/storage");
    return result.data ?? [];
  }

  async getNodeQemu(node: string): Promise<ProxmoxGuestListItem[]> {
    const encoded = encodeURIComponent(node);
    const result = await this.getJsonOptional<ProxmoxGuestListItem[]>(
      `/api2/json/nodes/${encoded}/qemu`,
    );
    return result.data ?? [];
  }

  async getNodeLxc(node: string): Promise<ProxmoxGuestListItem[]> {
    const encoded = encodeURIComponent(node);
    const result = await this.getJsonOptional<ProxmoxGuestListItem[]>(
      `/api2/json/nodes/${encoded}/lxc`,
    );
    return result.data ?? [];
  }

  async collect(): Promise<ProxmoxRawSnapshot> {
    const warnings: CollectionWarning[] = [];

    const version = await this.getVersion();

    const [
      resourcesDefault,
      resourcesVm,
      resourcesStorage,
      resourcesNode,
      nodes,
      clusterStorage,
    ] = await Promise.all([
      this.getClusterResources().catch(() => [] as ProxmoxClusterResource[]),
      this.getClusterResources("vm").catch(() => [] as ProxmoxClusterResource[]),
      this.getClusterResources("storage").catch(() => [] as ProxmoxClusterResource[]),
      this.getClusterResources("node").catch(() => [] as ProxmoxClusterResource[]),
      this.getNodes().catch(() => [] as ProxmoxNodeListItem[]),
      this.getClusterStorage().catch(() => [] as ProxmoxStorage[]),
    ]);

    const resourceMap = new Map<string, ProxmoxClusterResource>();
    for (const list of [
      resourcesDefault,
      resourcesVm,
      resourcesStorage,
      resourcesNode,
    ]) {
      for (const resource of list) {
        resourceMap.set(resourceKey(resource), resource);
      }
    }

    const nodeNames = [
      ...new Set([
        ...nodes.map((item) => item.node).filter((name): name is string => !!name),
        ...[...resourceMap.values()]
          .map((item) => item.node)
          .filter((name): name is string => !!name),
      ]),
    ];

    const nodeStatus: ProxmoxRawSnapshot["nodeStatus"] = {};
    const storages: ProxmoxRawSnapshot["storages"] = {};
    const nodeGuests: ProxmoxRawSnapshot["nodeGuests"] = {};

    await Promise.all(
      nodeNames.map(async (node) => {
        const [statusResult, storageResult, qemuResult, lxcResult] =
          await Promise.allSettled([
            this.getNodeStatus(node),
            this.getNodeStorage(node),
            this.getNodeQemu(node),
            this.getNodeLxc(node),
          ]);

        if (statusResult.status === "fulfilled") {
          nodeStatus[node] = statusResult.value;
          if (statusResult.value === null) {
            warnings.push({
              scope: "node",
              target: node,
              message: `Node status unavailable for ${node} (Sys.Audit permission may be required)`,
            });
          }
        } else {
          nodeStatus[node] = null;
          warnings.push({
            scope: "node",
            target: node,
            message: `Failed to fetch status for node ${node}`,
          });
        }

        if (storageResult.status === "fulfilled") {
          storages[node] = storageResult.value;
        } else {
          storages[node] = [];
          warnings.push({
            scope: "storage",
            target: node,
            message: `Failed to fetch storage for node ${node}`,
          });
        }

        const qemu =
          qemuResult.status === "fulfilled" ? qemuResult.value : [];
        const lxc =
          lxcResult.status === "fulfilled" ? lxcResult.value : [];

        if (qemuResult.status === "rejected") {
          warnings.push({
            scope: "workload",
            target: node,
            message: `Failed to fetch QEMU VMs for node ${node}`,
          });
        }
        if (lxcResult.status === "rejected") {
          warnings.push({
            scope: "workload",
            target: node,
            message: `Failed to fetch LXC containers for node ${node}`,
          });
        }

        nodeGuests[node] = { qemu, lxc };

        for (const guest of qemu) {
          const resource = guestToResource(node, guest, "qemu");
          resourceMap.set(resourceKey(resource), resource);
        }
        for (const guest of lxc) {
          const resource = guestToResource(node, guest, "lxc");
          resourceMap.set(resourceKey(resource), resource);
        }
      }),
    );

    const resources = [...resourceMap.values()];
    const hasGuestData = resources.some(
      (resource) => resource.type === "qemu" || resource.type === "lxc",
    );
    const hasMetricData = resources.some(
      (resource) =>
        resource.type === "node" &&
        (resource.maxcpu !== undefined ||
          resource.maxmem !== undefined ||
          resource.cpu !== undefined),
    );

    if (!hasGuestData && nodeNames.length > 0) {
      warnings.push({
        scope: "workload",
        message:
          "No virtual machines or containers were returned (VM.Audit permission may be required)",
      });
    }

    if (!hasMetricData && nodeNames.every((node) => nodeStatus[node] === null)) {
      warnings.push({
        scope: "cluster",
        message:
          "Node CPU and memory metrics unavailable (Sys.Audit permission may be required)",
      });
    }

    const collectionStatus = warnings.length > 0 ? "partial" : "complete";

    return {
      version,
      resources,
      nodes,
      nodeStatus,
      storages,
      clusterStorage,
      nodeGuests,
      collectionStatus,
      warnings,
    };
  }
}
