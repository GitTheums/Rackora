import type {
  DockerClient,
  DockerContainerInspect,
  DockerContainerSummary,
  DockerImageSummary,
  DockerInfoResponse,
  DockerStatsResponse,
} from "./types.js";

export type FakeDockerData = {
  info?: DockerInfoResponse;
  containers?: DockerContainerSummary[];
  inspect?: Record<string, DockerContainerInspect>;
  stats?: Record<string, DockerStatsResponse>;
  images?: DockerImageSummary[];
  pingOk?: boolean;
};

export function createFakeDockerClient(data: FakeDockerData = {}): DockerClient {
  return {
    async ping() {
      return data.pingOk ?? true;
    },
    async info() {
      return (
        data.info ?? {
          ServerVersion: "27.0.0",
          OSType: "linux",
          Architecture: "x86_64",
          NCPU: 4,
          MemTotal: 8_000_000_000,
        }
      );
    },
    async listContainers() {
      return data.containers ?? [];
    },
    async inspectContainer(id) {
      const found = data.inspect?.[id];
      if (!found) {
        throw new Error(`No such container: ${id}`);
      }
      return found;
    },
    async containerStats(id) {
      const found = data.stats?.[id];
      if (!found) {
        throw new Error(`No stats for container: ${id}`);
      }
      return found;
    },
    async listImages() {
      return data.images ?? [];
    },
  };
}

export function sampleFakeDockerData(): FakeDockerData {
  const containerId =
    "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456";

  return {
    pingOk: true,
    info: {
      ServerVersion: "27.1.0",
      OSType: "linux",
      Architecture: "x86_64",
      NCPU: 8,
      MemTotal: 16_000_000_000,
    },
    containers: [
      {
        Id: containerId,
        Names: ["/compose-web-1"],
        Image: "nginx:1.27",
        State: "running",
        Status: "Up 2 hours (healthy)",
        Created: 1_720_000_000,
        Labels: {
          "com.docker.compose.service": "web",
          "com.docker.compose.project": "demo",
          "secret.env": "should-not-pass",
        },
      },
    ],
    inspect: {
      [containerId]: {
        Id: containerId,
        Name: "/compose-web-1",
        Created: "2024-07-03T12:00:00.000Z",
        Image: "sha256:abc123def4567890",
        RestartCount: 2,
        State: {
          Status: "running",
          StartedAt: "2024-07-03T12:05:00.000Z",
          Health: { Status: "healthy" },
        },
        Config: {
          Image: "nginx:1.27",
          Labels: {
            "com.docker.compose.service": "web",
            "com.docker.compose.project": "demo",
            "secret.env": "should-not-pass",
          },
          Env: ["SECRET=super-secret", "PATH=/usr/bin"],
          Cmd: ["/bin/sh", "-c", "nginx -g 'daemon off;'"],
          Entrypoint: ["/docker-entrypoint.sh"],
        },
        Mounts: [
          {
            Type: "bind",
            Source: "/home/user/.ssh",
            Destination: "/root/.ssh",
            Mode: "rw",
          },
          {
            Type: "volume",
            Source: "/var/lib/docker/volumes/data/_data",
            Destination: "/data",
            Mode: "rw",
          },
        ],
      },
    },
    stats: {
      [containerId]: {
        cpu_stats: {
          cpu_usage: { total_usage: 200_000_000, percpu_usage: [1, 1, 1, 1] },
          system_cpu_usage: 2_000_000_000,
          online_cpus: 4,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 100_000_000 },
          system_cpu_usage: 1_000_000_000,
        },
        memory_stats: {
          usage: 20_000_000,
          limit: 100_000_000,
          stats: { cache: 2_000_000 },
        },
        networks: {
          eth0: { rx_bytes: 1000, tx_bytes: 2000 },
        },
        blkio_stats: {
          io_service_bytes_recursive: [
            { op: "read", value: 3000 },
            { op: "write", value: 4000 },
          ],
        },
      },
    },
    images: [
      {
        Id: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        RepoTags: ["nginx:1.27", "nginx:latest"],
        RepoDigests: [
          "nginx@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ],
        Size: 45_000_000,
        Created: 1_720_000_000,
      },
      {
        Id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        RepoTags: ["<none>:<none>"],
        RepoDigests: ["<none>@<none>"],
        Size: 1_000,
        Created: 1_720_000_100,
      },
    ],
  };
}
