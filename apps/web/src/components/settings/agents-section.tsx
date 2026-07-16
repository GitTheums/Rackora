import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Check,
  Copy,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Server,
  X,
} from "lucide-react";
import {
  type AgentConnectionStatus,
  type AgentResponse,
  type EnrollmentTokenResponse,
} from "@rackora/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/dashboard/states";
import {
  ApiError,
  createEnrollmentToken,
  formatDevError,
  getCurrentUser,
  listAgents,
  listEnrollmentTokens,
  revokeAgent,
} from "@/lib/api";
import { formatBytes, formatPercent, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Poll agent/pending-token state without hammering the API. */
const AGENTS_REFRESH_INTERVAL_MS = 20_000;

const STATUS_META: Record<
  AgentConnectionStatus,
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  online: { label: "Online", variant: "success" },
  degraded: { label: "Degraded", variant: "warning" },
  offline: { label: "Offline", variant: "muted" },
  revoked: { label: "Revoked", variant: "destructive" },
  pending: { label: "Pending", variant: "info" },
};

const STATUS_SORT_ORDER: Record<AgentConnectionStatus, number> = {
  online: 0,
  degraded: 1,
  offline: 2,
  pending: 3,
  revoked: 4,
};

const EXPIRY_OPTIONS = [
  { label: "15 minutes", seconds: 15 * 60 },
  { label: "30 minutes", seconds: 30 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
  { label: "24 hours", seconds: 24 * 60 * 60 },
] as const;

function fieldClassName() {
  return "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";
}

function AgentStatusBadge({ status }: { status: AgentConnectionStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function valueOrFallback(value: string | null | undefined, fallback: string) {
  if (value === null || value === undefined || value.trim() === "") {
    return fallback;
  }
  return value;
}

function coreUrlExample() {
  if (typeof window !== "undefined" && window.location?.origin) {
    const url = new URL(window.location.origin);
    if (url.port === "5173") {
      url.port = "7575";
    }
    return url.origin;
  }
  return "http://<RACKORA_HOST>:7575";
}

function sortAgents(agents: AgentResponse[]): AgentResponse[] {
  return [...agents].sort((left, right) => {
    const statusDelta =
      STATUS_SORT_ORDER[left.status] - STATUS_SORT_ORDER[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return left.name.localeCompare(right.name);
  });
}

export function AgentsSection() {
  const [agents, setAgents] = useState<AgentResponse[]>([]);
  const [pendingTokens, setPendingTokens] = useState<EnrollmentTokenResponse[]>(
    [],
  );
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<EnrollmentTokenResponse | null>(
    null,
  );
  const [detailAgent, setDetailAgent] = useState<AgentResponse | null>(null);
  const [menuAgentId, setMenuAgentId] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      // Keep agents and pending-token fetches independent so one bad response
      // does not wipe the other dataset from the UI.
      const me = await getCurrentUser();
      setCsrfToken(me.csrfToken);

      const [agentResult, tokenResult] = await Promise.allSettled([
        listAgents(),
        listEnrollmentTokens(true),
      ]);

      if (agentResult.status === "fulfilled") {
        setAgents(sortAgents(agentResult.value.agents));
      } else {
        throw agentResult.reason;
      }

      if (tokenResult.status === "fulfilled") {
        setPendingTokens(tokenResult.value.tokens);
      } else if (agentResult.status === "fulfilled") {
        // Agents loaded; keep pending empty rather than failing the page.
        setPendingTokens([]);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : formatDevError(err, "Could not load agents."),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
      initialLoadDone.current = true;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!initialLoadDone.current || addOpen) {
        return;
      }
      void load({ silent: true });
    }, AGENTS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load, addOpen]);

  async function onRevoke(agent: AgentResponse) {
    if (!csrfToken) {
      return;
    }
    const confirmed = window.confirm(
      "Revoke this agent? It will no longer be able to send telemetry until it is enrolled again.",
    );
    if (!confirmed) {
      return;
    }
    setMenuAgentId(null);
    try {
      await revokeAgent(agent.id, csrfToken);
      if (detailAgent?.id === agent.id) {
        setDetailAgent(null);
      }
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : formatDevError(err, "Could not revoke agent."),
      );
    }
  }

  const hasAgents = agents.length > 0;
  const hasPending = pendingTokens.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Agents</CardTitle>
          <CardDescription>
            Manage hosts that send Docker and system telemetry to Rackora.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading || refreshing}
          >
            <RefreshCw
              aria-hidden
              className={cn(refreshing ? "animate-spin" : undefined)}
            />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setCreatedToken(null);
              setAddOpen(true);
            }}
          >
            <Plus aria-hidden />
            Add agent
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {loading ? (
          <div className="space-y-3" data-testid="agents-loading">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error && !hasAgents ? (
          <ErrorState
            title="Could not load agents"
            description={error}
            onRetry={() => void load()}
          />
        ) : (
          <>
            <section aria-labelledby="enrolled-agents-heading">
              <div className="mb-3">
                <h3
                  id="enrolled-agents-heading"
                  className="text-sm font-medium text-foreground"
                >
                  Enrolled agents
                </h3>
                <p className="text-sm text-muted-foreground">
                  Status is based on recent heartbeats, not enrollment tokens.
                </p>
              </div>

              {!hasAgents ? (
                <EmptyState
                  icon={Server}
                  title="No agents have been enrolled yet."
                  description="Add an agent to collect read-only Docker and host telemetry."
                  action={
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setCreatedToken(null);
                        setAddOpen(true);
                      }}
                    >
                      <Plus aria-hidden />
                      Add agent
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Hostname</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Last heartbeat</TableHead>
                        <TableHead>Docker</TableHead>
                        <TableHead>Enrolled</TableHead>
                        <TableHead className="w-12">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agents.map((agent) => (
                        <TableRow key={agent.id} data-testid={`agent-row-${agent.id}`}>
                          <TableCell className="font-medium">
                            {agent.name}
                          </TableCell>
                          <TableCell>
                            <AgentStatusBadge status={agent.status} />
                          </TableCell>
                          <TableCell>
                            {valueOrFallback(
                              agent.hostname,
                              agent.lastHeartbeatAt
                                ? "Not reported yet"
                                : "Waiting for first heartbeat",
                            )}
                          </TableCell>
                          <TableCell>
                            {valueOrFallback(
                              agent.version,
                              "Not reported yet",
                            )}
                          </TableCell>
                          <TableCell>
                            {agent.lastHeartbeatAt ? (
                              <span
                                title={new Date(
                                  agent.lastHeartbeatAt,
                                ).toLocaleString()}
                              >
                                {formatRelativeTime(agent.lastHeartbeatAt)}
                              </span>
                            ) : (
                              "Waiting for first heartbeat"
                            )}
                          </TableCell>
                          <TableCell>
                            {agent.dockerAvailable === null
                              ? "Not reported yet"
                              : agent.dockerAvailable
                                ? "Connected"
                                : "Docker is not available"}
                          </TableCell>
                          <TableCell>
                            <span
                              title={new Date(agent.enrolledAt).toLocaleString()}
                            >
                              {formatRelativeTime(agent.enrolledAt)}
                            </span>
                          </TableCell>
                          <TableCell className="relative">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${agent.name}`}
                              onClick={() =>
                                setMenuAgentId((current) =>
                                  current === agent.id ? null : agent.id,
                                )
                              }
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                            {menuAgentId === agent.id ? (
                              <div className="absolute right-2 z-20 mt-1 w-40 rounded-lg border border-border bg-card p-1 shadow-lg">
                                <button
                                  type="button"
                                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                                  onClick={() => {
                                    setDetailAgent(agent);
                                    setMenuAgentId(null);
                                  }}
                                >
                                  View details
                                </button>
                                {agent.status !== "revoked" ? (
                                  <button
                                    type="button"
                                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
                                    onClick={() => void onRevoke(agent)}
                                  >
                                    Revoke agent
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            {hasPending ? (
              <section aria-labelledby="pending-enrollments-heading">
                <div className="mb-3">
                  <h3
                    id="pending-enrollments-heading"
                    className="text-sm font-medium text-foreground"
                  >
                    Pending enrollments
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Unused one-time tokens waiting for an agent to enroll.
                    Consumed and expired tokens are hidden.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingTokens.map((token) => (
                        <TableRow
                          key={`pending-${token.id}`}
                          data-testid={`pending-token-${token.id}`}
                        >
                          <TableCell className="font-medium">
                            {token.name}
                          </TableCell>
                          <TableCell>
                            <AgentStatusBadge status="pending" />
                          </TableCell>
                          <TableCell>
                            <span
                              title={new Date(token.expiresAt).toLocaleString()}
                            >
                              {formatRelativeTime(token.expiresAt)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              title={new Date(token.createdAt).toLocaleString()}
                            >
                              {formatRelativeTime(token.createdAt)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ) : null}

            {error && hasAgents ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}
      </CardContent>

      {addOpen ? (
        <AddAgentModal
          csrfToken={csrfToken}
          createdToken={createdToken}
          onCreated={(token) => {
            setCreatedToken(token);
            void load();
          }}
          onClose={() => {
            setAddOpen(false);
            setCreatedToken(null);
            void load({ silent: true });
          }}
        />
      ) : null}

      {detailAgent ? (
        <AgentDetailDrawer
          agent={detailAgent}
          onClose={() => setDetailAgent(null)}
          onRevoke={() => void onRevoke(detailAgent)}
        />
      ) : null}
    </Card>
  );
}

function AddAgentModal({
  csrfToken,
  createdToken,
  onCreated,
  onClose,
}: {
  csrfToken: string | null;
  createdToken: EnrollmentTokenResponse | null;
  onCreated: (token: EnrollmentTokenResponse) => void;
  onClose: () => void;
}) {
  const [agentName, setAgentName] = useState("");
  const [expiresInSeconds, setExpiresInSeconds] = useState(30 * 60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const coreUrl = useMemo(() => coreUrlExample(), []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!csrfToken) {
      setError("Missing CSRF token. Refresh and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await createEnrollmentToken(
        {
          agentName,
          expiresInSeconds,
        },
        csrfToken,
      );
      onCreated(token);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : formatDevError(err, "Could not create enrollment token."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!createdToken?.token) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdToken.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy token to clipboard.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close add agent dialog"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {createdToken?.token ? "Enrollment token created" : "Add agent"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {createdToken?.token
                ? "Copy the token now. It cannot be shown again."
                : "Create a one-time enrollment token for a new host."}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </Button>
        </div>

        <div className="space-y-4 p-5">
          {!createdToken?.token ? (
            <form className="space-y-4" onSubmit={onSubmit}>
              <label className="block text-sm">
                <span className="font-medium text-foreground">Agent name</span>
                <input
                  className={fieldClassName()}
                  value={agentName}
                  onChange={(event) => setAgentName(event.target.value)}
                  placeholder="docker-host-1"
                  pattern="^[a-zA-Z0-9][a-zA-Z0-9._-]*$"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">Token expiry</span>
                <select
                  className={fieldClassName()}
                  value={expiresInSeconds}
                  onChange={(event) =>
                    setExpiresInSeconds(Number(event.target.value))
                  }
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option.seconds} value={option.seconds}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !csrfToken}>
                  {busy ? "Creating…" : "Create token"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
                This token is shown only once. Copy it now. Rackora cannot
                display it again.
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Enrollment token
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="block flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 text-xs">
                    {createdToken.token}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyToken()}>
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                    {copied ? "Copied" : "Copy token"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Expires {new Date(createdToken.expiresAt).toLocaleString()}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">
                  Agent configuration
                </p>
                <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs text-foreground">
{`CORE_URL=${coreUrl}
ENROLLMENT_TOKEN=${createdToken.token}
AGENT_NAME=${createdToken.name}
DATA_DIR=/data
HEARTBEAT_INTERVAL_MS=30000`}
                </pre>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">
                  Docker Compose example
                </p>
                <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs text-foreground">
{`services:
  rackora-agent:
    image: rackora/agent:latest
    restart: unless-stopped
    environment:
      CORE_URL: ${coreUrl}
      ENROLLMENT_TOKEN: ${createdToken.token}
      AGENT_NAME: ${createdToken.name}
      DATA_DIR: /data
      HEARTBEAT_INTERVAL_MS: "30000"
      DOCKER_SOCKET: /var/run/docker.sock
    volumes:
      - agent-data:/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /:/host/root:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /etc/os-release:/host/etc/os-release:ro

volumes:
  agent-data:`}
                </pre>
              </div>

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentDetailDrawer({
  agent,
  onClose,
  onRevoke,
}: {
  agent: AgentResponse;
  onClose: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close agent details"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Agent
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {agent.name}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex items-center gap-2">
            <AgentStatusBadge status={agent.status} />
          </div>

          <DetailRow label="Version" value={valueOrFallback(agent.version, "Not reported yet")} />
          <DetailRow
            label="Hostname"
            value={valueOrFallback(
              agent.hostname,
              agent.lastHeartbeatAt
                ? "Not reported yet"
                : "Waiting for first heartbeat",
            )}
          />
          <DetailRow label="Operating system" value={valueOrFallback(agent.os, "Not reported yet")} />
          <DetailRow
            label="Architecture"
            value={valueOrFallback(agent.architecture, "Not reported yet")}
          />
          <DetailRow
            label="Enrolled at"
            value={new Date(agent.enrolledAt).toLocaleString()}
          />
          <DetailRow
            label="Last heartbeat"
            value={
              agent.lastHeartbeatAt
                ? `${formatRelativeTime(agent.lastHeartbeatAt)} (${new Date(agent.lastHeartbeatAt).toLocaleString()})`
                : "Waiting for first heartbeat"
            }
          />
          <DetailRow
            label="Last telemetry"
            value={
              agent.telemetryReceivedAt
                ? `${formatRelativeTime(agent.telemetryReceivedAt)} (${new Date(agent.telemetryReceivedAt).toLocaleString()})`
                : "No telemetry received yet"
            }
          />
          <p className="text-xs text-muted-foreground">
            Heartbeat confirms the agent is reachable. Telemetry is the latest
            host and Docker inventory payload.
          </p>
          <DetailRow
            label="Docker"
            value={
              agent.dockerAvailable === null
                ? "Not reported yet"
                : agent.dockerAvailable
                  ? `Available${agent.dockerEngineVersion ? ` (Engine ${agent.dockerEngineVersion})` : ""}`
                  : "Docker is not available"
            }
          />
          <DetailRow
            label="Containers"
            value={
              agent.containerCount === null
                ? "Not reported yet"
                : String(agent.containerCount)
            }
          />
          <DetailRow
            label="CPU"
            value={
              agent.cpuUsagePercent === null
                ? "Not reported yet"
                : formatPercent(agent.cpuUsagePercent, 1)
            }
          />
          <DetailRow
            label="Memory"
            value={
              agent.memoryUsedBytes === null || agent.memoryTotalBytes === null
                ? "Not reported yet"
                : `${formatBytes(agent.memoryUsedBytes)} / ${formatBytes(agent.memoryTotalBytes)}`
            }
          />
          {agent.revokedAt ? (
            <DetailRow
              label="Revoked at"
              value={new Date(agent.revokedAt).toLocaleString()}
            />
          ) : null}
        </div>

        <div className="border-t border-border p-4">
          {agent.status !== "revoked" ? (
            <Button type="button" variant="destructive" className="w-full" onClick={onRevoke}>
              Revoke agent
            </Button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              This agent has been revoked.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("flex flex-col gap-1 border-b border-border/60 pb-3")}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
