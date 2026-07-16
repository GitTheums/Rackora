import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Container,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Server,
  Thermometer,
  X,
} from "lucide-react";
import type {
  DockerContainerView,
  DockerFleetSummary,
  HostView,
} from "@rackora/shared";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState, ErrorState } from "@/components/dashboard/states";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useApiResource } from "@/hooks/use-api-resource";
import {
  formatDevError,
  getDockerSummary,
  listDockerContainers,
  listHosts,
} from "@/lib/api";
import {
  formatBytes,
  formatPercent,
  formatRelativeTime,
  formatUptime,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type StateFilter = "all" | "running" | "stopped";
type HealthFilter = "all" | "healthy" | "unhealthy" | "none" | "starting";

type DockerBundle = {
  summary: DockerFleetSummary;
  containers: DockerContainerView[];
  hosts: HostView[];
  warnings: string[];
  stale: boolean;
  partial: boolean;
  lastUpdatedAt: string | null;
};

const REFRESH_MS = 20_000;

function unavailable(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "Not reported";
  }
  return String(value);
}

function containerStateLabel(state: DockerContainerView["state"]): string {
  switch (state) {
    case "running":
      return "Running";
    case "exited":
      return "Stopped";
    case "paused":
      return "Paused";
    case "restarting":
      return "Restarting";
    case "created":
      return "Created";
    case "dead":
      return "Dead";
    case "removing":
      return "Removing";
    default:
      return "Unknown";
  }
}

function healthLabel(health: DockerContainerView["health"]): string {
  switch (health) {
    case "healthy":
      return "Healthy";
    case "unhealthy":
      return "Unhealthy";
    case "starting":
      return "Starting";
    default:
      return "None";
  }
}

function isStopped(state: DockerContainerView["state"]): boolean {
  return state === "exited" || state === "dead" || state === "created";
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function DockerPage() {
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [selected, setSelected] = useState<DockerContainerView | null>(null);

  const loadBundle = useCallback(async (signal: AbortSignal): Promise<DockerBundle> => {
    const [summary, containersResponse, hostsResponse] = await Promise.all([
      getDockerSummary(),
      listDockerContainers(),
      listHosts(),
    ]);
    if (signal.aborted) {
      throw new Error("aborted");
    }
    return {
      summary,
      containers: containersResponse.containers,
      hosts: hostsResponse.hosts,
      warnings: [
        ...new Set([
          ...summary.warnings,
          ...containersResponse.warnings,
          ...hostsResponse.hosts.flatMap((host) => host.warnings),
        ]),
      ],
      stale: summary.stale || containersResponse.stale || hostsResponse.stale,
      partial:
        summary.partial ||
        containersResponse.partial ||
        hostsResponse.partial,
      lastUpdatedAt:
        summary.lastUpdatedAt ??
        containersResponse.lastUpdatedAt ??
        hostsResponse.lastUpdatedAt,
    };
  }, []);

  const resource = useApiResource(loadBundle, {
    staleTime: 10_000,
    refetchInterval: REFRESH_MS,
  });

  const agents = useMemo(() => {
    if (!resource.data) {
      return [];
    }
    const names = new Map<string, string>();
    for (const container of resource.data.containers) {
      names.set(container.agentId, container.agentName);
    }
    for (const host of resource.data.hosts) {
      names.set(host.agentId, host.agentName);
    }
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  }, [resource.data]);

  const filteredContainers = useMemo(() => {
    if (!resource.data) {
      return [];
    }
    const query = search.trim().toLowerCase();
    return resource.data.containers.filter((container) => {
      if (agentFilter !== "all" && container.agentId !== agentFilter) {
        return false;
      }
      if (stateFilter === "running" && container.state !== "running") {
        return false;
      }
      if (stateFilter === "stopped" && !isStopped(container.state)) {
        return false;
      }
      if (healthFilter !== "all" && container.health !== healthFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        container.name.toLowerCase().includes(query) ||
        container.image.toLowerCase().includes(query) ||
        (container.hostname ?? "").toLowerCase().includes(query)
      );
    });
  }, [agentFilter, healthFilter, resource.data, search, stateFilter]);

  function refreshAll() {
    resource.refetch();
  }

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {resource.data?.lastUpdatedAt ? (
        <span className="text-xs text-muted-foreground">
          Updated {formatRelativeTime(resource.data.lastUpdatedAt)}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={refreshAll}
        disabled={resource.status === "loading" && !resource.data}
      >
        <RefreshCw aria-hidden />
        Refresh
      </Button>
    </div>
  );

  if (resource.status === "loading" && !resource.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Docker"
          description="Container and host telemetry from enrolled Rackora Agents."
          actions={headerActions}
        />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (resource.status === "error" && !resource.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Docker"
          description="Container and host telemetry from enrolled Rackora Agents."
          actions={headerActions}
        />
        <ErrorState
          title="Could not load Docker telemetry"
          description={formatDevError(
            resource.error,
            "Could not load Docker telemetry.",
          )}
          onRetry={refreshAll}
        />
      </div>
    );
  }

  const data = resource.data!;
  const summary = data.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Docker"
        description="Container and host telemetry from enrolled Rackora Agents."
        actions={headerActions}
      />

      {(resource.stale || data.stale) && (
        <div
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            Showing the last successful telemetry. Data may be stale until the
            next successful refresh.
          </p>
        </div>
      )}

      {data.partial || data.warnings.length > 0 ? (
        <div
          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          role="status"
        >
          Partial telemetry was received
          {data.warnings.length > 0
            ? `: ${data.warnings.slice(0, 3).join("; ")}`
            : "."}
        </div>
      ) : null}

      {summary.pageState === "no_agents" ? (
        <EmptyState
          icon={Server}
          title="No Rackora Agents have been enrolled yet."
          description="Enroll an agent in Settings → Agents to collect Docker and host telemetry."
        />
      ) : summary.pageState === "waiting_for_telemetry" ? (
        <EmptyState
          icon={Container}
          title="Waiting for the first telemetry report."
          description="An agent is enrolled. Host and container data will appear after the next successful heartbeat."
        />
      ) : summary.pageState === "docker_unavailable" ? (
        <>
          <EmptyState
            icon={Container}
            title="Docker is not available on this agent."
            description="Host telemetry may still be available below. Check the Docker socket mount and permissions on the agent."
          />
          <HostsSection hosts={data.hosts} />
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Agents online" value={summary.onlineAgents} />
            <SummaryCard
              label="Containers running"
              value={summary.runningContainers}
            />
            <SummaryCard
              label="Containers stopped"
              value={summary.stoppedContainers}
            />
            <SummaryCard
              label="Unhealthy containers"
              value={summary.unhealthyContainers}
            />
          </div>

          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Containers</CardTitle>
                  <CardDescription>
                    Live inventory reported by enrolled agents.
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-col gap-2 lg:flex-row">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 lg:max-w-xs"
                  placeholder="Search name or image"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search containers"
                />
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={agentFilter}
                  onChange={(event) => setAgentFilter(event.target.value)}
                  aria-label="Filter by agent"
                >
                  <option value="all">All agents</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={stateFilter}
                  onChange={(event) =>
                    setStateFilter(event.target.value as StateFilter)
                  }
                  aria-label="Filter by state"
                >
                  <option value="all">All states</option>
                  <option value="running">Running</option>
                  <option value="stopped">Stopped</option>
                </select>
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={healthFilter}
                  onChange={(event) =>
                    setHealthFilter(event.target.value as HealthFilter)
                  }
                  aria-label="Filter by health"
                >
                  <option value="all">All health</option>
                  <option value="healthy">Healthy</option>
                  <option value="unhealthy">Unhealthy</option>
                  <option value="starting">Starting</option>
                  <option value="none">None</option>
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {filteredContainers.length === 0 ? (
                <EmptyState
                  icon={Container}
                  title="No containers match the current filters."
                  description="Adjust search or filters to see containers."
                  className="py-10"
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Agent / host</TableHead>
                        <TableHead>Image</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Health</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>Memory</TableHead>
                        <TableHead>Network</TableHead>
                        <TableHead>Uptime</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContainers.map((container) => (
                        <TableRow
                          key={`${container.agentId}:${container.id}`}
                          className="cursor-pointer"
                          onClick={() => setSelected(container)}
                          data-testid={`container-row-${container.shortId}`}
                        >
                          <TableCell className="font-medium">
                            {container.name}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{container.agentName}</span>
                              <span className="text-xs text-muted-foreground">
                                {unavailable(container.hostname)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            {container.image}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                container.state === "running"
                                  ? "success"
                                  : "muted"
                              }
                            >
                              {containerStateLabel(container.state)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                container.health === "unhealthy"
                                  ? "destructive"
                                  : container.health === "healthy"
                                    ? "success"
                                    : "muted"
                              }
                            >
                              {healthLabel(container.health)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {container.cpuPercent === null
                              ? "Not reported"
                              : formatPercent(container.cpuPercent, 1)}
                          </TableCell>
                          <TableCell>
                            {container.memoryUsedBytes === null
                              ? "Not reported"
                              : formatBytes(container.memoryUsedBytes)}
                          </TableCell>
                          <TableCell>
                            {container.netRxBytes === null ||
                            container.netTxBytes === null
                              ? "Not reported"
                              : `${formatBytes(container.netRxBytes)} / ${formatBytes(container.netTxBytes)}`}
                          </TableCell>
                          <TableCell>
                            {container.startedAt
                              ? formatUptime(
                                  Math.max(
                                    0,
                                    Math.floor(
                                      (Date.now() -
                                        Date.parse(container.startedAt)) /
                                        1000,
                                    ),
                                  ),
                                )
                              : unavailable(null)}
                          </TableCell>
                          <TableCell>
                            {formatRelativeTime(container.collectedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <HostsSection hosts={data.hosts} />
        </>
      )}

      {selected ? (
        <ContainerDrawer
          container={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function HostsSection({ hosts }: { hosts: HostView[] }) {
  if (hosts.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-labelledby="hosts-heading">
      <div>
        <h2 id="hosts-heading" className="text-base font-semibold text-foreground">
          Hosts
        </h2>
        <p className="text-sm text-muted-foreground">
          Host metrics collected by enrolled Rackora Agents.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {hosts.map((host) => (
          <HostCard key={host.agentId} host={host} />
        ))}
      </div>
    </section>
  );
}

function HostCard({ host }: { host: HostView }) {
  const memoryPercent =
    host.memoryUsedBytes !== null &&
    host.memoryTotalBytes !== null &&
    host.memoryTotalBytes > 0
      ? Math.min(
          100,
          (host.memoryUsedBytes / host.memoryTotalBytes) * 100,
        )
      : null;

  return (
    <Card data-testid={`host-card-${host.agentId}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {host.hostname ?? host.agentName}
            </CardTitle>
            <CardDescription>
              Agent {host.agentName}
              {host.agentVersion ? ` · v${host.agentVersion}` : ""}
            </CardDescription>
          </div>
          <Badge
            variant={
              host.status === "online"
                ? "success"
                : host.status === "degraded"
                  ? "warning"
                  : "muted"
            }
          >
            {host.status === "online"
              ? "Online"
              : host.status === "degraded"
                ? "Degraded"
                : host.status === "offline"
                  ? "Offline"
                  : host.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Detail label="OS" value={unavailable(host.os)} />
          <Detail label="Architecture" value={unavailable(host.architecture)} />
          <Detail
            label="Uptime"
            value={
              host.uptimeSeconds === null
                ? "Not reported"
                : formatUptime(host.uptimeSeconds)
            }
          />
          <Detail
            label="Docker Engine"
            value={
              host.dockerAvailable === false
                ? "Unavailable"
                : unavailable(host.dockerEngineVersion)
            }
          />
          <Detail
            label="Last heartbeat"
            value={
              host.lastHeartbeatAt
                ? formatRelativeTime(host.lastHeartbeatAt)
                : "Not reported"
            }
          />
          <Detail
            label="Last telemetry"
            value={
              host.lastTelemetryAt
                ? formatRelativeTime(host.lastTelemetryAt)
                : "Not reported"
            }
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Cpu className="size-3.5" aria-hidden />
              CPU
              {host.cpuCores !== null ? ` (${host.cpuCores} cores)` : ""}
            </span>
            <span>
              {host.cpuUsagePercent === null
                ? "Not reported"
                : formatPercent(host.cpuUsagePercent, 1)}
            </span>
          </div>
          {host.cpuUsagePercent !== null ? (
            <Progress value={host.cpuUsagePercent} aria-label="Host CPU usage" />
          ) : null}
          <p className="text-xs text-muted-foreground">
            Load average:{" "}
            {host.loadAverage
              ? host.loadAverage.map((value) => value.toFixed(2)).join(", ")
              : "Not reported"}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MemoryStick className="size-3.5" aria-hidden />
              Memory
            </span>
            <span>
              {host.memoryUsedBytes === null || host.memoryTotalBytes === null
                ? "Not reported"
                : `${formatBytes(host.memoryUsedBytes)} / ${formatBytes(host.memoryTotalBytes)}`}
            </span>
          </div>
          {memoryPercent !== null ? (
            <Progress value={memoryPercent} aria-label="Host memory usage" />
          ) : null}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <HardDrive className="size-3.5" aria-hidden />
            Filesystems
          </p>
          {host.filesystems.length === 0 ? (
            <p className="text-xs text-muted-foreground">Not reported</p>
          ) : (
            <ul className="space-y-2">
              {host.filesystems.map((fs) => {
                const percent =
                  fs.totalBytes > 0
                    ? Math.min(100, (fs.usedBytes / fs.totalBytes) * 100)
                    : 0;
                return (
                  <li key={fs.mountpoint}>
                    <div className="flex items-center justify-between text-xs">
                      <span>{fs.mountpoint}</span>
                      <span className="text-muted-foreground">
                        {formatBytes(fs.usedBytes)} / {formatBytes(fs.totalBytes)}
                      </span>
                    </div>
                    <Progress
                      value={percent}
                      className="mt-1"
                      aria-label={`${fs.mountpoint} usage`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Thermometer className="size-3.5" aria-hidden />
            Temperatures
          </p>
          {host.temperatures.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No temperature sensors detected
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {host.temperatures.map((temp) => (
                <li
                  key={`${temp.source}:${temp.name}`}
                  className="flex justify-between gap-3"
                >
                  <span className="truncate">{temp.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {temp.celsius.toFixed(1)} °C
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function ContainerDrawer({
  container,
  onClose,
}: {
  container: DockerContainerView;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close container details"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Container
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {container.name}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
          <div className="flex gap-2">
            <Badge variant={container.state === "running" ? "success" : "muted"}>
              {containerStateLabel(container.state)}
            </Badge>
            <Badge
              variant={
                container.health === "unhealthy" ? "destructive" : "muted"
              }
            >
              {healthLabel(container.health)}
            </Badge>
          </div>
          <Detail label="Agent" value={container.agentName} />
          <Detail label="Hostname" value={unavailable(container.hostname)} />
          <Detail label="Image" value={container.image} />
          <Detail label="Image ID" value={unavailable(container.imageId)} />
          <Detail
            label="Image digest"
            value={unavailable(container.imageDigest)}
          />
          <Detail label="Container ID" value={container.shortId} />
          <Detail
            label="Created"
            value={new Date(container.createdAt).toLocaleString()}
          />
          <Detail
            label="Started"
            value={
              container.startedAt
                ? new Date(container.startedAt).toLocaleString()
                : "Not reported"
            }
          />
          <Detail
            label="Restart count"
            value={
              container.restartCount === null
                ? "Not reported"
                : String(container.restartCount)
            }
          />
          <Detail
            label="CPU"
            value={
              container.cpuPercent === null
                ? "Not reported"
                : formatPercent(container.cpuPercent, 1)
            }
          />
          <Detail
            label="Memory"
            value={
              container.memoryUsedBytes === null
                ? "Not reported"
                : `${formatBytes(container.memoryUsedBytes)}${
                    container.memoryLimitBytes
                      ? ` / ${formatBytes(container.memoryLimitBytes)}`
                      : ""
                  }`
            }
          />
          <Detail
            label="Network RX / TX"
            value={
              container.netRxBytes === null || container.netTxBytes === null
                ? "Not reported"
                : `${formatBytes(container.netRxBytes)} / ${formatBytes(container.netTxBytes)}`
            }
          />
          <Detail
            label="Block read / write"
            value={
              container.blockReadBytes === null ||
              container.blockWriteBytes === null
                ? "Not reported"
                : `${formatBytes(container.blockReadBytes)} / ${formatBytes(container.blockWriteBytes)}`
            }
          />
          <Detail
            label="Last telemetry"
            value={new Date(container.collectedAt).toLocaleString()}
          />
          {Object.keys(container.labels).length > 0 ? (
            <div>
              <p className="text-xs text-muted-foreground">Labels</p>
              <ul className="mt-1 space-y-1">
                {Object.entries(container.labels).map(([key, value]) => (
                  <li key={key} className={cn("truncate text-xs")}>
                    <span className="text-muted-foreground">{key}=</span>
                    {value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
