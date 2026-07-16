import type {
  Alert,
  Checks,
  Docker,
  Infrastructure,
  Integrations,
  MetricPoint,
  Overview,
  Updates,
} from "./dashboard.js";

const GiB = 1024 * 1024 * 1024;

/** Fixed reference time so mock data is fully deterministic (great for tests). */
const NOW = Date.parse("2026-01-15T12:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

/**
 * Build a smooth-ish time series ending "now", using a seeded pseudo-random
 * walk so the shape is stable across renders and test runs.
 */
function buildSeries(
  points: number,
  base: number,
  amplitude: number,
  seed: number,
): MetricPoint[] {
  const series: MetricPoint[] = [];
  let value = base;
  let state = seed;

  for (let index = points - 1; index >= 0; index -= 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const noise = (state / 0x7fffffff - 0.5) * amplitude;
    value = Math.max(0, base + noise);
    series.push({
      t: minutesAgo(index * 5),
      value: Math.round(value * 10) / 10,
    });
  }

  return series;
}

export const mockOverview: Overview = {
  systems: { healthy: 11, total: 12 },
  cpu: {
    usagePercent: 34,
    cores: 16,
    history: buildSeries(24, 32, 22, 7),
  },
  memory: {
    usedBytes: 41 * GiB,
    totalBytes: 64 * GiB,
    usagePercent: 64,
    history: buildSeries(24, 62, 12, 13),
  },
  storage: {
    usedBytes: 5_600 * GiB,
    totalBytes: 12_000 * GiB,
    usagePercent: 47,
    pools: [
      { name: "rpool", usedBytes: 320 * GiB, totalBytes: 500 * GiB },
      { name: "tank", usedBytes: 5_100 * GiB, totalBytes: 10_000 * GiB },
      { name: "backups", usedBytes: 180 * GiB, totalBytes: 1_500 * GiB },
    ],
  },
  internet: {
    latencyMs: 14,
    status: "healthy",
    target: "1.1.1.1",
    history: buildSeries(24, 14, 8, 29),
  },
  docker: { running: 18, stopped: 2, total: 20 },
  updates: { available: 7, security: 2 },
  recentAlerts: [
    {
      id: "al-1",
      title: "Backup pool above 75% capacity",
      source: "tank",
      severity: "warning",
      createdAt: minutesAgo(38),
      acknowledged: false,
    },
    {
      id: "al-2",
      title: "Security updates available on pve-node-2",
      source: "updates",
      severity: "warning",
      createdAt: minutesAgo(122),
      acknowledged: false,
    },
    {
      id: "al-3",
      title: "Container jellyfin restarted",
      source: "docker",
      severity: "info",
      createdAt: minutesAgo(220),
      acknowledged: true,
    },
  ],
};

export const mockAlerts: Alert[] = [
  ...mockOverview.recentAlerts,
  {
    id: "al-4",
    title: "HTTP check nextcloud slow response",
    source: "checks",
    severity: "warning",
    createdAt: minutesAgo(340),
    acknowledged: true,
  },
  {
    id: "al-5",
    title: "Node pve-node-3 unreachable",
    source: "infrastructure",
    severity: "critical",
    createdAt: minutesAgo(1_450),
    acknowledged: true,
  },
];

export const mockInfrastructure: Infrastructure = {
  nodes: [
    {
      id: "pve-node-1",
      name: "pve-node-1",
      state: "healthy",
      cpuPercent: 28,
      memoryPercent: 61,
      storagePercent: 44,
      uptimeSeconds: 61 * 24 * 3600,
      guests: [
        {
          id: "100",
          name: "docker-host",
          kind: "qemu",
          state: "healthy",
          cpuPercent: 22,
          memoryPercent: 54,
          uptimeSeconds: 61 * 24 * 3600,
        },
        {
          id: "101",
          name: "home-assistant",
          kind: "lxc",
          state: "healthy",
          cpuPercent: 9,
          memoryPercent: 38,
          uptimeSeconds: 30 * 24 * 3600,
        },
      ],
      storages: [
        {
          id: "pve-node-1/local-lvm",
          name: "local-lvm",
          node: "pve-node-1",
          type: "lvmthin",
          usedBytes: 220 * GiB,
          totalBytes: 500 * GiB,
          usagePercent: 44,
          state: "healthy",
        },
      ],
    },
    {
      id: "pve-node-2",
      name: "pve-node-2",
      state: "degraded",
      cpuPercent: 47,
      memoryPercent: 78,
      storagePercent: 69,
      uptimeSeconds: 12 * 24 * 3600,
      guests: [
        {
          id: "200",
          name: "nas",
          kind: "qemu",
          state: "healthy",
          cpuPercent: 15,
          memoryPercent: 40,
          uptimeSeconds: 12 * 24 * 3600,
        },
        {
          id: "201",
          name: "media",
          kind: "lxc",
          state: "degraded",
          cpuPercent: 63,
          memoryPercent: 88,
          uptimeSeconds: 4 * 24 * 3600,
        },
      ],
      storages: [
        {
          id: "pve-node-2/tank",
          name: "tank",
          node: "pve-node-2",
          type: "zfspool",
          usedBytes: 6_900 * GiB,
          totalBytes: 10_000 * GiB,
          usagePercent: 69,
          state: "healthy",
        },
      ],
    },
    {
      id: "pve-node-3",
      name: "pve-node-3",
      state: "down",
      cpuPercent: 0,
      memoryPercent: 0,
      storagePercent: 0,
      uptimeSeconds: 0,
      guests: [],
      storages: [],
    },
  ],
  clusterStorages: [],
  warnings: [],
};

export const mockDocker: Docker = {
  containers: [
    {
      id: "c1",
      name: "traefik",
      image: "traefik:v3.1",
      host: "docker-host",
      state: "healthy",
      status: "Up 12 days",
      cpuPercent: 1.2,
      memoryMb: 78,
    },
    {
      id: "c2",
      name: "jellyfin",
      image: "jellyfin/jellyfin:10.9",
      host: "docker-host",
      state: "healthy",
      status: "Up 3 hours",
      cpuPercent: 24.5,
      memoryMb: 640,
    },
    {
      id: "c3",
      name: "postgres",
      image: "postgres:16",
      host: "docker-host",
      state: "healthy",
      status: "Up 12 days",
      cpuPercent: 3.1,
      memoryMb: 312,
    },
    {
      id: "c4",
      name: "nextcloud",
      image: "nextcloud:29",
      host: "docker-host",
      state: "degraded",
      status: "Up 12 days (unhealthy)",
      cpuPercent: 8.7,
      memoryMb: 890,
    },
    {
      id: "c5",
      name: "backup-runner",
      image: "restic/restic:0.16",
      host: "nas",
      state: "down",
      status: "Exited (0) 2 hours ago",
      cpuPercent: 0,
      memoryMb: 0,
    },
  ],
};

export const mockChecks: Checks = {
  checks: [
    {
      id: "chk-1",
      name: "Router",
      kind: "ping",
      target: "192.168.1.1",
      state: "healthy",
      latencyMs: 1,
      lastCheckedAt: minutesAgo(1),
      uptimePercent: 100,
    },
    {
      id: "chk-2",
      name: "Nextcloud",
      kind: "http",
      target: "https://cloud.home.lan",
      state: "degraded",
      latencyMs: 842,
      lastCheckedAt: minutesAgo(1),
      uptimePercent: 98.6,
    },
    {
      id: "chk-3",
      name: "Jellyfin",
      kind: "http",
      target: "https://media.home.lan",
      state: "healthy",
      latencyMs: 46,
      lastCheckedAt: minutesAgo(2),
      uptimePercent: 99.9,
    },
    {
      id: "chk-4",
      name: "Postgres",
      kind: "tcp",
      target: "192.168.1.20:5432",
      state: "healthy",
      latencyMs: 3,
      lastCheckedAt: minutesAgo(1),
      uptimePercent: 100,
    },
    {
      id: "chk-5",
      name: "Backup NAS",
      kind: "ping",
      target: "192.168.1.30",
      state: "down",
      latencyMs: null,
      lastCheckedAt: minutesAgo(3),
      uptimePercent: 91.2,
    },
  ],
};

export const mockUpdates: Updates = {
  items: [
    {
      id: "up-1",
      name: "proxmox-ve",
      host: "pve-node-1",
      currentVersion: "8.2.2",
      availableVersion: "8.2.4",
      security: false,
    },
    {
      id: "up-2",
      name: "openssl",
      host: "pve-node-2",
      currentVersion: "3.0.11",
      availableVersion: "3.0.13",
      security: true,
    },
    {
      id: "up-3",
      name: "linux-image",
      host: "pve-node-2",
      currentVersion: "6.8.4",
      availableVersion: "6.8.8",
      security: true,
    },
    {
      id: "up-4",
      name: "jellyfin",
      host: "docker-host",
      currentVersion: "10.9.6",
      availableVersion: "10.9.11",
      security: false,
    },
    {
      id: "up-5",
      name: "traefik",
      host: "docker-host",
      currentVersion: "3.1.0",
      availableVersion: "3.1.2",
      security: false,
    },
  ],
};

export const mockIntegrations: Integrations = {
  integrations: [
    {
      id: "int-proxmox",
      name: "Proxmox VE",
      category: "Virtualization",
      description: "Read-only telemetry from your Proxmox cluster.",
      status: "connected",
    },
    {
      id: "int-docker",
      name: "Docker",
      category: "Containers",
      description: "Container stats via the Rackora agent.",
      status: "connected",
    },
    {
      id: "int-uptimekuma",
      name: "Uptime Kuma",
      category: "Monitoring",
      description: "Import external uptime checks.",
      status: "disconnected",
    },
    {
      id: "int-ntfy",
      name: "ntfy",
      category: "Notifications",
      description: "Push alerts to your devices.",
      status: "error",
    },
  ],
};
