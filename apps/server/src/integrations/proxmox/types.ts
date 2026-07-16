/** Loose shapes for Proxmox API JSON — fields are optional to tolerate partial data. */

export type ProxmoxVersion = {
  version?: string;
  release?: string;
  repoid?: string;
};

export type ProxmoxClusterResource = {
  id?: string;
  type?: string;
  node?: string;
  vmid?: number;
  name?: string;
  status?: string;
  uptime?: number;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  template?: number;
  storage?: string;
  content?: string;
  shared?: number;
  active?: number;
  enabled?: number;
};

export type ProxmoxNodeListItem = {
  node?: string;
  status?: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  uptime?: number;
  ssl_fingerprint?: string;
  type?: string;
  id?: string;
};

export type ProxmoxNodeStatus = {
  uptime?: number;
  cpu?: number;
  wait?: number;
  idle?: number;
  cpuinfo?: {
    cpus?: number;
    cores?: number;
    sockets?: number;
  };
  memory?: {
    used?: number;
    total?: number;
    free?: number;
  };
  swap?: {
    used?: number;
    total?: number;
    free?: number;
  };
  rootfs?: {
    used?: number;
    total?: number;
    free?: number;
  };
  pveversion?: string;
  kversion?: string;
};

export type ProxmoxStorage = {
  storage?: string;
  type?: string;
  content?: string;
  active?: number;
  enabled?: number;
  shared?: number;
  used?: number;
  total?: number;
  avail?: number;
};

/** VM/LXC list item from /nodes/{node}/qemu or /nodes/{node}/lxc. */
export type ProxmoxGuestListItem = {
  vmid?: number;
  name?: string;
  status?: string;
  uptime?: number;
  cpu?: number;
  cpus?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  template?: number;
};

export type CollectionWarning = {
  scope: "cluster" | "node" | "storage" | "workload";
  target?: string;
  message: string;
};

export type CollectionStatus = "complete" | "partial" | "failed";

export type ProxmoxRawSnapshot = {
  version: ProxmoxVersion;
  resources: ProxmoxClusterResource[];
  nodes: ProxmoxNodeListItem[];
  nodeStatus: Record<string, ProxmoxNodeStatus | null>;
  storages: Record<string, ProxmoxStorage[]>;
  clusterStorage: ProxmoxStorage[];
  nodeGuests: Record<string, { qemu: ProxmoxGuestListItem[]; lxc: ProxmoxGuestListItem[] }>;
  collectionStatus: CollectionStatus;
  warnings: CollectionWarning[];
};
