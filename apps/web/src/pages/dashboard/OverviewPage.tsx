import { useState } from "react";
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  PlayCircle,
  RefreshCw,
  ServerCog,
  StopCircle,
} from "lucide-react";
import type { ProxmoxOverview } from "@rackora/shared";
import { formatCpuUsage } from "@rackora/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  SeverityBadge,
  usageIndicator,
  usageTone,
} from "@/components/dashboard/status";
import { EmptyState, ErrorState } from "@/components/dashboard/states";
import { StatGridSkeleton } from "@/components/dashboard/skeletons";
import { useApiResource } from "@/hooks/use-api-resource";
import { formatDevError, getOverview } from "@/lib/api";
import {
  formatBytes,
  formatPercent,
  formatRelativeTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function ResourceCard({
  label,
  icon: Icon,
  percent,
  primaryText,
  unavailable,
  displayText,
}: {
  label: string;
  icon: typeof Cpu;
  percent: number;
  primaryText: string;
  unavailable: boolean;
  displayText?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" aria-hidden />
          <span className="text-sm font-medium">{label}</span>
        </div>
        {unavailable ? (
          <Badge variant="muted">Unavailable</Badge>
        ) : (
          <span className={cn("text-sm font-semibold", usageTone(percent))}>
            {displayText ?? formatPercent(percent)}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{primaryText}</p>
      {!unavailable ? (
        <Progress
          value={percent}
          aria-label={`${label} usage`}
          indicatorClassName={usageIndicator(percent)}
          className="mt-3"
        />
      ) : null}
    </Card>
  );
}

function ProxmoxOverviewContent({
  proxmox,
  onRefresh,
  refreshing,
}: {
  proxmox: ProxmoxOverview & { connected: true };
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const systemsTotal = proxmox.systems.total;
  const systemsHealthy = proxmox.systems.healthy;
  const systemsPercent =
    systemsTotal > 0 ? (systemsHealthy / systemsTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      {(proxmox.stale || proxmox.partial) && (
        <div className="space-y-2">
          {proxmox.stale ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
              Data is stale
              {proxmox.collectedAt
                ? ` — last updated ${formatRelativeTime(proxmox.collectedAt)}`
                : ""}
            </p>
          ) : null}
          {proxmox.partial ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
              Partial data — some Proxmox API requests did not return complete information
            </p>
          ) : null}
        </div>
      )}

      {proxmox.collectedAt ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Last updated {formatRelativeTime(proxmox.collectedAt)}
            {proxmox.integrationName ? ` · ${proxmox.integrationName}` : ""}
          </p>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
            Refresh
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Systems health"
          icon={ServerCog}
          value={`${systemsHealthy}/${systemsTotal}`}
          hint="online nodes"
          badge={
            systemsHealthy === systemsTotal && systemsTotal > 0 ? (
              <Badge variant="success">All healthy</Badge>
            ) : (
              <Badge variant="warning">Degraded</Badge>
            )
          }
        >
          <Progress value={systemsPercent} aria-label="Systems health" />
        </StatCard>

        <StatCard
          label="Online nodes"
          icon={Activity}
          value={String(proxmox.summary.nodesOnline)}
          hint={`of ${proxmox.summary.nodesTotal} total`}
        />

        <StatCard
          label="Running workloads"
          icon={PlayCircle}
          value={String(proxmox.summary.workloadsRunning)}
          hint={`${proxmox.summary.qemuTotal} VMs · ${proxmox.summary.lxcTotal} LXC`}
        />

        <StatCard
          label="Stopped workloads"
          icon={StopCircle}
          value={String(proxmox.summary.workloadsStopped)}
          hint="intentionally stopped"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ResourceCard
          label="CPU"
          icon={Cpu}
          percent={proxmox.cpu.usagePercent}
          unavailable={!proxmox.cpu.available}
          displayText={formatCpuUsage({
            ratio: proxmox.cpu.usageRatio,
            percent: proxmox.cpu.usagePercent,
            available: proxmox.cpu.available,
          })}
          primaryText={
            proxmox.cpu.available
              ? `${proxmox.cpu.cores} physical cores`
              : "CPU metrics unavailable — Sys.Audit permission may be required"
          }
        />
        <ResourceCard
          label="Memory"
          icon={MemoryStick}
          percent={proxmox.memory.usagePercent}
          unavailable={!proxmox.memory.available}
          primaryText={
            proxmox.memory.available
              ? `${formatBytes(proxmox.memory.usedBytes)} of ${formatBytes(
                  proxmox.memory.totalBytes,
                )}`
              : "No memory data available"
          }
        />
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="size-4" aria-hidden />
              <span className="text-sm font-medium">Storage</span>
            </div>
            {proxmox.storage.available ? (
              <span
                className={cn(
                  "text-sm font-semibold",
                  usageTone(proxmox.storage.usagePercent),
                )}
              >
                {formatPercent(proxmox.storage.usagePercent)}
              </span>
            ) : (
              <Badge variant="muted">Unavailable</Badge>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {proxmox.storage.available
              ? `${formatBytes(proxmox.storage.usedBytes)} of ${formatBytes(
                  proxmox.storage.totalBytes,
                )}`
              : "No storage pools reported — Datastore.Audit permission may be required"}
          </p>
          {proxmox.storage.available ? (
            <div className="mt-4 space-y-3">
              {proxmox.storage.pools.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No storage pools reported
                </p>
              ) : (
                proxmox.storage.pools.map((pool) => {
                  const poolPercent =
                    pool.totalBytes > 0
                      ? (pool.usedBytes / pool.totalBytes) * 100
                      : 0;
                  return (
                    <div key={pool.name}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {pool.name}
                        </span>
                        <span className="text-muted-foreground">
                          {formatBytes(pool.usedBytes)} /{" "}
                          {formatBytes(pool.totalBytes)}
                        </span>
                      </div>
                      <Progress
                        value={poolPercent}
                        aria-label={`${pool.name} usage`}
                        indicatorClassName={usageIndicator(poolPercent)}
                        className="mt-1.5"
                      />
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Infrastructure summary</CardTitle>
          <CardDescription>
            {proxmox.version
              ? `Proxmox ${proxmox.version}${proxmox.release ? ` (${proxmox.release})` : ""}`
              : "Proxmox cluster"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-7">
            <div>
              <dt className="text-muted-foreground">Nodes</dt>
              <dd className="text-lg font-semibold">{proxmox.summary.nodesTotal}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Online</dt>
              <dd className="text-lg font-semibold">{proxmox.summary.nodesOnline}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">VMs</dt>
              <dd className="text-lg font-semibold">{proxmox.summary.qemuTotal}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">LXC</dt>
              <dd className="text-lg font-semibold">{proxmox.summary.lxcTotal}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Running</dt>
              <dd className="text-lg font-semibold">{proxmox.summary.workloadsRunning}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Stopped</dt>
              <dd className="text-lg font-semibold">{proxmox.summary.workloadsStopped}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last updated</dt>
              <dd className="text-sm font-medium">
                {proxmox.collectedAt
                  ? formatRelativeTime(proxmox.collectedAt)
                  : "Unknown"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Infrastructure status</CardTitle>
          <CardDescription>Recent synchronization events</CardDescription>
        </CardHeader>
        <CardContent>
          {proxmox.syncEvents.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No status events"
              description="Synchronization events will appear here after the next collection."
            />
          ) : (
            <ul className="divide-y divide-border">
              {proxmox.syncEvents.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {event.title}
                    </p>
                    {event.detail ? (
                      <p className="text-xs text-muted-foreground">{event.detail}</p>
                    ) : null}
                    {event.at ? (
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeTime(event.at)}
                      </p>
                    ) : null}
                  </div>
                  <SeverityBadge severity={event.severity} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DisconnectedProxmoxOverview({ message }: { message: string }) {
  return (
    <EmptyState
      icon={ServerCog}
      title="Proxmox unavailable"
      description={message}
    />
  );
}

export function OverviewPage() {
  const [refreshing, setRefreshing] = useState(false);
  const resource = useApiResource(
    (signal) => getOverview().then((data) => {
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return data;
    }),
    { staleTime: 30_000, refetchInterval: 60_000 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="A calm, at-a-glance summary of your homelab health."
      />

      {resource.status === "loading" ? (
        <StatGridSkeleton />
      ) : resource.status === "error" ? (
        <ErrorState
          description={formatDevError(
            resource.error,
            "Could not load overview data.",
          )}
        />
      ) : resource.data.proxmox.connected ? (
        <ProxmoxOverviewContent
          proxmox={resource.data.proxmox}
          onRefresh={() => {
            setRefreshing(true);
            resource.refetch();
            window.setTimeout(() => setRefreshing(false), 1000);
          }}
          refreshing={refreshing}
        />
      ) : (
        <DisconnectedProxmoxOverview message={resource.data.proxmox.message} />
      )}
    </div>
  );
}
