import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  X,
} from "lucide-react";
import type {
  Guest,
  Infrastructure,
  Node,
  ServiceState,
  StoragePool,
} from "@rackora/shared";
import { formatCpuUsage } from "@rackora/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  StatusBadge,
  usageIndicator,
  usageTone,
} from "@/components/dashboard/status";
import { EmptyState, ErrorState } from "@/components/dashboard/states";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { useApiResource } from "@/hooks/use-api-resource";
import {
  formatBytes,
  formatPercent,
  formatRelativeTime,
  formatUptime,
} from "@/lib/format";
import { formatDevError, getInfrastructure } from "@/lib/api";
import { cn } from "@/lib/utils";

type Tab = "nodes" | "vms" | "lxc" | "storage";
type StateFilter = "all" | ServiceState;

type Selection =
  | { type: "node"; node: Node }
  | { type: "guest"; node: Node; guest: Guest }
  | { type: "storage"; storage: StoragePool };

type GuestRow = Guest & { nodeName: string; parentNode: Node };

function Metric({
  icon: Icon,
  label,
  percent,
  cpuRatio,
}: {
  icon: typeof Cpu;
  label: string;
  percent: number;
  cpuRatio?: number;
}) {
  const isCpu = label === "CPU";
  const cpuAvailable = cpuRatio !== undefined;
  const display = isCpu
    ? formatCpuUsage({
        ratio: cpuRatio,
        percent,
        available: cpuAvailable,
      })
    : formatPercent(percent);

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </span>
        <span
          className={cn(
            "font-medium",
            isCpu && !cpuAvailable ? "text-muted-foreground" : usageTone(percent),
          )}
        >
          {display}
        </span>
      </div>
      {isCpu && !cpuAvailable ? null : (
        <Progress
          value={percent}
          aria-label={`${label} usage`}
          indicatorClassName={usageIndicator(percent)}
          className="mt-1.5"
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Filters({
  query,
  state,
  node,
  nodes,
  onQuery,
  onState,
  onNode,
}: {
  query: string;
  state: StateFilter;
  node: string;
  nodes: string[];
  onQuery: (value: string) => void;
  onState: (value: StateFilter) => void;
  onNode: (value: string) => void;
}) {
  const selectClass =
    "h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <input
        className="h-9 w-full flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 sm:max-w-xs"
        placeholder="Search by name or VMID…"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        aria-label="Search"
      />
      <select
        className={selectClass}
        value={state}
        onChange={(event) => onState(event.target.value as StateFilter)}
        aria-label="Filter by status"
      >
        <option value="all">All statuses</option>
        <option value="healthy">Running / online</option>
        <option value="degraded">Degraded</option>
        <option value="down">Stopped / offline</option>
        <option value="unknown">Unknown</option>
      </select>
      <select
        className={selectClass}
        value={node}
        onChange={(event) => onNode(event.target.value)}
        aria-label="Filter by node"
      >
        <option value="all">All nodes</option>
        {nodes.map((nodeName) => (
          <option key={nodeName} value={nodeName}>
            {nodeName}
          </option>
        ))}
      </select>
    </div>
  );
}

function DetailDrawer({
  selection,
  onClose,
}: {
  selection: Selection | null;
  onClose: () => void;
}) {
  if (!selection) {
    return null;
  }

  const title =
    selection.type === "node"
      ? selection.node.name
      : selection.type === "guest"
        ? selection.guest.name
        : selection.storage.name;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close details"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {selection.type === "node"
                ? "Node"
                : selection.type === "guest"
                  ? selection.guest.kind.toUpperCase()
                  : "Storage"}
            </p>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {selection.type === "node" ? (
            <>
              <div className="flex items-center gap-2">
                <StatusBadge state={selection.node.state} />
                <span className="text-sm text-muted-foreground">
                  {selection.node.state === "down"
                    ? "Offline"
                    : `Up ${formatUptime(selection.node.uptimeSeconds)}`}
                </span>
              </div>
              <div className="grid gap-3">
                <Metric
                  icon={Cpu}
                  label="CPU"
                  percent={selection.node.cpuPercent}
                  cpuRatio={selection.node.cpuRatio}
                />
                <Metric
                  icon={MemoryStick}
                  label="Memory"
                  percent={selection.node.memoryPercent}
                />
                <Metric
                  icon={HardDrive}
                  label="Storage"
                  percent={selection.node.storagePercent}
                />
              </div>
              {selection.node.cpuCount !== undefined ? (
                <p className="text-sm text-muted-foreground">
                  {selection.node.cpuCount} CPU cores
                </p>
              ) : null}
              {selection.node.memoryBytes !== undefined &&
              selection.node.maxMemoryBytes !== undefined ? (
                <p className="text-sm text-muted-foreground">
                  Memory {formatBytes(selection.node.memoryBytes)} /{" "}
                  {formatBytes(selection.node.maxMemoryBytes)}
                </p>
              ) : null}
            </>
          ) : selection.type === "guest" ? (
            <>
              <div className="flex items-center gap-2">
                <StatusBadge state={selection.guest.state} />
                <Badge variant="outline">
                  {selection.guest.kind === "qemu" ? "VM" : "LXC"}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Node</dt>
                  <dd className="font-medium">{selection.node.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">VMID</dt>
                  <dd className="font-medium">{selection.guest.vmid ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium">{selection.guest.status ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Uptime</dt>
                  <dd className="font-medium">
                    {formatUptime(selection.guest.uptimeSeconds)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">CPU</dt>
                  <dd className="font-medium">
                    {formatCpuUsage({
                      ratio: selection.guest.cpuRatio,
                      percent: selection.guest.cpuPercent,
                      available: selection.guest.cpuRatio !== undefined,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Memory</dt>
                  <dd className="font-medium">
                    {formatPercent(selection.guest.memoryPercent)}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <StatusBadge state={selection.storage.state} />
                <Badge variant="outline">{selection.storage.type}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Node</dt>
                  <dd className="font-medium">{selection.storage.node}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Usage</dt>
                  <dd className="font-medium">
                    {formatPercent(selection.storage.usagePercent)}
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                {formatBytes(selection.storage.usedBytes)} /{" "}
                {formatBytes(selection.storage.totalBytes)}
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function matchesQuery(text: string, query: string, vmid?: number): boolean {
  if (!query) {
    return true;
  }
  const needle = query.trim().toLowerCase();
  if (text.toLowerCase().includes(needle)) {
    return true;
  }
  if (vmid !== undefined && String(vmid).includes(needle)) {
    return true;
  }
  return false;
}

function matchesStateFilter(state: ServiceState, filter: StateFilter): boolean {
  return filter === "all" || state === filter;
}

export function InfrastructurePage() {
  const resource = useApiResource(
    (signal) => getInfrastructure().then((data) => {
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return data;
    }),
    { staleTime: 30_000, refetchInterval: 60_000 },
  );

  const data = resource.status === "success" ? resource.data : null;
  const [tab, setTab] = useState<Tab>("nodes");
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [nodeFilter, setNodeFilter] = useState("all");
  const [selection, setSelection] = useState<Selection | null>(null);

  const nodeNames = useMemo(
    () => (data ? data.nodes.map((node) => node.name).sort() : []),
    [data],
  );

  const filteredNodes = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.nodes.filter((node) => {
      if (nodeFilter !== "all" && node.name !== nodeFilter) {
        return false;
      }
      if (!matchesStateFilter(node.state, stateFilter)) {
        return false;
      }
      return matchesQuery(node.name, query);
    });
  }, [data, query, stateFilter, nodeFilter]);

  const guestRows = useMemo((): GuestRow[] => {
    if (!data) {
      return [];
    }
    return data.nodes.flatMap((node) =>
      node.guests.map((guest) => ({
        ...guest,
        nodeName: node.name,
        parentNode: node,
      })),
    );
  }, [data]);

  const filteredVms = useMemo(() => {
    return guestRows
      .filter((guest) => guest.kind === "qemu")
      .filter((guest) => nodeFilter === "all" || guest.nodeName === nodeFilter)
      .filter((guest) => matchesStateFilter(guest.state, stateFilter))
      .filter((guest) => matchesQuery(guest.name, query, guest.vmid))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [guestRows, nodeFilter, stateFilter, query]);

  const filteredLxc = useMemo(() => {
    return guestRows
      .filter((guest) => guest.kind === "lxc")
      .filter((guest) => nodeFilter === "all" || guest.nodeName === nodeFilter)
      .filter((guest) => matchesStateFilter(guest.state, stateFilter))
      .filter((guest) => matchesQuery(guest.name, query, guest.vmid))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [guestRows, nodeFilter, stateFilter, query]);

  const filteredStorage = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.nodes
      .flatMap((node) => node.storages)
      .filter(
        (storage) => nodeFilter === "all" || storage.node === nodeFilter,
      )
      .filter((storage) => matchesStateFilter(storage.state, stateFilter))
      .filter((storage) => matchesQuery(storage.name, query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, nodeFilter, stateFilter, query]);

  const renderStatusBanner = (infra: Infrastructure) => (
    <>
      {infra.partial ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
          Partial data — some Proxmox API requests did not return complete information
        </p>
      ) : null}
      {infra.stale ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
          Data is stale
          {infra.collectedAt
            ? ` — laatst bijgewerkt ${formatRelativeTime(infra.collectedAt)}`
            : ""}
        </p>
      ) : null}
      {infra.healthStatus && infra.healthStatus !== "healthy" ? (
        <p className="text-sm text-warning">
          Integration health: {infra.healthStatus}
          {infra.lastError ? ` — ${infra.lastError}` : ""}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Infrastructure"
        description="Read-only view of your Proxmox nodes and guests."
        actions={
          data?.collectedAt ? (
            <span className="text-xs text-muted-foreground">
              Updated {formatRelativeTime(data.collectedAt)}
            </span>
          ) : null
        }
      />

      {resource.status === "loading" ? (
        <TableSkeleton />
      ) : resource.status === "error" ? (
        <div className="space-y-3">
          <ErrorState
            description={formatDevError(
              resource.error,
              "Could not load infrastructure.",
            )}
          />
          {resource.error.message.toLowerCase().includes("unauthorized") ? (
            <div className="text-center">
              <Link
                to="/login"
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
              >
                Sign in
              </Link>
            </div>
          ) : null}
        </div>
      ) : !data || data.nodes.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No nodes connected"
          description="Connect the Proxmox integration to see your cluster."
          action={
            <Link
              to="/integrations"
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Configure Proxmox
            </Link>
          }
        />
      ) : (
        <>
          {renderStatusBanner(data)}

          <div className="flex flex-wrap items-center gap-2">
            <TabButton active={tab === "nodes"} onClick={() => setTab("nodes")}>
              Nodes ({data.nodes.length})
            </TabButton>
            <TabButton active={tab === "vms"} onClick={() => setTab("vms")}>
              Virtual Machines ({guestRows.filter((g) => g.kind === "qemu").length})
            </TabButton>
            <TabButton active={tab === "lxc"} onClick={() => setTab("lxc")}>
              LXC ({guestRows.filter((g) => g.kind === "lxc").length})
            </TabButton>
            <TabButton active={tab === "storage"} onClick={() => setTab("storage")}>
              Storage ({data.nodes.flatMap((n) => n.storages).length})
            </TabButton>
          </div>

          <Filters
            query={query}
            state={stateFilter}
            node={nodeFilter}
            nodes={nodeNames}
            onQuery={setQuery}
            onState={setStateFilter}
            onNode={setNodeFilter}
          />

          {tab === "nodes" ? (
            filteredNodes.length === 0 ? (
              <EmptyState title="No matches" description="Try a different filter." />
            ) : (
              <div className="space-y-4">
                {filteredNodes.map((node) => (
                  <Card key={node.id}>
                    <CardHeader className="flex-row items-center justify-between">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left"
                        onClick={() => setSelection({ type: "node", node })}
                      >
                        <Server className="size-4 text-muted-foreground" aria-hidden />
                        <CardTitle className="text-base hover:text-primary">
                          {node.name}
                        </CardTitle>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {node.state === "down"
                            ? "offline"
                            : `up ${formatUptime(node.uptimeSeconds)}`}
                        </span>
                        <StatusBadge state={node.state} />
                      </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Metric
                        icon={Cpu}
                        label="CPU"
                        percent={node.cpuPercent}
                        cpuRatio={node.cpuRatio}
                      />
                      <Metric
                        icon={MemoryStick}
                        label="Memory"
                        percent={node.memoryPercent}
                      />
                      <Metric
                        icon={HardDrive}
                        label="Storage"
                        percent={node.storagePercent}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : null}

          {tab === "vms" || tab === "lxc" ? (
            (tab === "vms" ? filteredVms : filteredLxc).length === 0 ? (
              <EmptyState title="No matches" description="Try a different filter." />
            ) : (
              <Card className="p-1.5">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>VMID</TableHead>
                      <TableHead>Node</TableHead>
                      <TableHead>CPU</TableHead>
                      <TableHead>Memory</TableHead>
                      <TableHead>Uptime</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(tab === "vms" ? filteredVms : filteredLxc).map((guest) => (
                      <TableRow
                        key={guest.id}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelection({
                            type: "guest",
                            node: guest.parentNode,
                            guest,
                          })
                        }
                      >
                        <TableCell className="font-medium text-primary">
                          {guest.name}
                        </TableCell>
                        <TableCell>{guest.vmid ?? "—"}</TableCell>
                        <TableCell>{guest.nodeName}</TableCell>
                        <TableCell>
                          {formatCpuUsage({
                            ratio: guest.cpuRatio,
                            percent: guest.cpuPercent,
                            available: guest.cpuRatio !== undefined,
                          })}
                        </TableCell>
                        <TableCell>{formatPercent(guest.memoryPercent)}</TableCell>
                        <TableCell>{formatUptime(guest.uptimeSeconds)}</TableCell>
                        <TableCell>
                          <StatusBadge state={guest.state} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )
          ) : null}

          {tab === "storage" ? (
            filteredStorage.length === 0 ? (
              <EmptyState title="No matches" description="Try a different filter." />
            ) : (
              <Card className="p-1.5">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Node</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStorage.map((storage) => (
                      <TableRow
                        key={storage.id}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelection({ type: "storage", storage })
                        }
                      >
                        <TableCell className="font-medium text-primary">
                          {storage.name}
                        </TableCell>
                        <TableCell>{storage.node}</TableCell>
                        <TableCell>{storage.type}</TableCell>
                        <TableCell>{formatBytes(storage.usedBytes)}</TableCell>
                        <TableCell>{formatBytes(storage.totalBytes)}</TableCell>
                        <TableCell>{formatPercent(storage.usagePercent)}</TableCell>
                        <TableCell>
                          <StatusBadge state={storage.state} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )
          ) : null}
        </>
      )}

      <DetailDrawer selection={selection} onClose={() => setSelection(null)} />
    </div>
  );
}
