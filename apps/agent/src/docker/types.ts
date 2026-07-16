/**
 * Read-only Docker Engine API surface used by the Rackora agent.
 * Intentionally excludes start/stop/create/delete/exec/update methods.
 */
export type DockerClient = {
  ping: () => Promise<boolean>;
  info: () => Promise<DockerInfoResponse>;
  listContainers: (options?: { all?: boolean }) => Promise<DockerContainerSummary[]>;
  inspectContainer: (id: string) => Promise<DockerContainerInspect>;
  containerStats: (id: string) => Promise<DockerStatsResponse>;
  listImages: () => Promise<DockerImageSummary[]>;
};

export type DockerInfoResponse = {
  ServerVersion?: string;
  OSType?: string;
  Architecture?: string;
  NCPU?: number;
  MemTotal?: number;
};

export type DockerContainerSummary = {
  Id: string;
  Names?: string[];
  Image?: string;
  State?: string;
  Status?: string;
  Created?: number;
  Labels?: Record<string, string>;
};

export type DockerContainerInspect = {
  Id: string;
  Name?: string;
  Created?: string;
  Image?: string;
  RestartCount?: number;
  State?: {
    Status?: string;
    StartedAt?: string;
    FinishedAt?: string;
    Health?: {
      Status?: string;
    };
  };
  Config?: {
    Image?: string;
    Labels?: Record<string, string>;
    Env?: string[];
    Cmd?: string[];
    Entrypoint?: string[] | string;
  };
  Mounts?: Array<{
    Type?: string;
    Source?: string;
    Destination?: string;
    Mode?: string;
  }>;
};

export type DockerStatsResponse = {
  cpu_stats?: {
    cpu_usage?: {
      total_usage?: number;
      percpu_usage?: number[];
    };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats?: {
    cpu_usage?: {
      total_usage?: number;
    };
    system_cpu_usage?: number;
  };
  memory_stats?: {
    usage?: number;
    limit?: number;
    stats?: {
      cache?: number;
    };
  };
  networks?: Record<
    string,
    {
      rx_bytes?: number;
      tx_bytes?: number;
    }
  >;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{
      op?: string;
      value?: number;
    }>;
  };
};

export type DockerImageSummary = {
  Id: string;
  RepoTags?: string[] | null;
  RepoDigests?: string[] | null;
  Size?: number;
  Created?: number;
};
