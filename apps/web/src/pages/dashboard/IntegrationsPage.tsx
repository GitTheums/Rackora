import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plug, Server } from "lucide-react";
import {
  type IntegrationRecord,
  type TlsMode,
} from "@rackora/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState, ErrorState } from "@/components/dashboard/states";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/dashboard/status";
import {
  ApiError,
  createProxmoxIntegration,
  formatDevError,
  getCurrentUser,
  listIntegrations,
  testProxmoxConnection,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

const HEALTH_TO_CATALOG: Record<
  IntegrationRecord["healthStatus"],
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  healthy: { label: "Connected", variant: "success" },
  degraded: { label: "Degraded", variant: "warning" },
  down: { label: "Error", variant: "destructive" },
  unknown: { label: "Not configured", variant: "muted" },
};

type FormState = {
  name: string;
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  tlsMode: TlsMode;
  customCa: string;
};

const emptyForm: FormState = {
  name: "Proxmox VE",
  baseUrl: "",
  tokenId: "",
  tokenSecret: "",
  tlsMode: "verify",
  customCa: "",
};

function fieldClassName() {
  return "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";
}

function ProxmoxForm({
  csrfToken,
  onSaved,
}: {
  csrfToken: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onTest() {
    setBusy("test");
    setError(null);
    setMessage(null);
    try {
      const result = await testProxmoxConnection(
        {
          baseUrl: form.baseUrl,
          tokenId: form.tokenId,
          tokenSecret: form.tokenSecret,
          tlsMode: form.tlsMode,
          customCa: form.tlsMode === "custom-ca" ? form.customCa : undefined,
        },
        csrfToken,
      );
      if (result.ok) {
        setMessage(
          result.version
            ? `Connected (Proxmox ${result.version}${result.release ? ` / ${result.release}` : ""})`
            : result.message,
        );
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(formatDevError(err, "Connection test failed."));
    } finally {
      setBusy(null);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      await createProxmoxIntegration(
        {
          name: form.name,
          enabled: true,
          pollIntervalMs: 60_000,
          config: {
            baseUrl: form.baseUrl,
            tokenId: form.tokenId,
            tokenSecret: form.tokenSecret,
            tlsMode: form.tlsMode,
            customCa: form.tlsMode === "custom-ca" ? form.customCa : undefined,
          },
        },
        csrfToken,
      );
      setMessage("Proxmox integration saved.");
      setForm(emptyForm);
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : formatDevError(err, "Could not save integration."),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect Proxmox VE</CardTitle>
        <CardDescription>
          Read-only API token access. Token secrets are encrypted at rest and
          never shown again after saving.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSave} id="proxmox-form">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Display name</span>
            <input
              className={fieldClassName()}
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Base URL</span>
            <input
              className={fieldClassName()}
              placeholder="https://192.168.1.10:8006"
              value={form.baseUrl}
              onChange={(event) => update("baseUrl", event.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Token ID</span>
            <input
              className={fieldClassName()}
              placeholder="root@pam!rackora"
              value={form.tokenId}
              onChange={(event) => update("tokenId", event.target.value)}
              autoComplete="off"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Token secret</span>
            <input
              type="password"
              className={fieldClassName()}
              value={form.tokenSecret}
              onChange={(event) => update("tokenSecret", event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">TLS mode</span>
            <select
              className={fieldClassName()}
              value={form.tlsMode}
              onChange={(event) =>
                update("tlsMode", event.target.value as TlsMode)
              }
            >
              <option value="verify">Verify certificate (recommended)</option>
              <option value="insecure">
                Allow insecure (self-signed, requires ALLOW_INSECURE_TLS)
              </option>
              <option value="custom-ca">Custom CA certificate</option>
            </select>
          </label>

          {form.tlsMode === "custom-ca" ? (
            <label className="block text-sm">
              <span className="font-medium text-foreground">
                Custom CA (PEM)
              </span>
              <textarea
                className={`${fieldClassName()} min-h-28 font-mono text-xs`}
                value={form.customCa}
                onChange={(event) => update("customCa", event.target.value)}
                required
              />
            </label>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-success" role="status">
              {message}
            </p>
          ) : null}
        </form>
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => {
            void onTest();
          }}
        >
          {busy === "test" ? "Testing…" : "Test connection"}
        </Button>
        <Button type="submit" form="proxmox-form" disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function IntegrationCard({ integration }: { integration: IntegrationRecord }) {
  const meta = HEALTH_TO_CATALOG[integration.healthStatus];

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{integration.name}</CardTitle>
          <CardDescription className="mt-0.5">Proxmox VE</CardDescription>
        </div>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 text-sm">
        <p className="text-muted-foreground break-all">
          {integration.config.baseUrl}
        </p>
        <div className="flex items-center gap-2">
          <StatusBadge state={integration.healthStatus} />
          <span className="text-xs text-muted-foreground">
            {integration.lastSuccessAt
              ? `Last success ${formatRelativeTime(integration.lastSuccessAt)}`
              : "No successful poll yet"}
          </span>
        </div>
        {integration.lastError ? (
          <p className="text-xs text-destructive">{integration.lastError}</p>
        ) : null}
      </CardContent>
      <CardFooter>
        <Link
          to="/infrastructure"
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          View infrastructure
        </Link>
      </CardFooter>
    </Card>
  );
}

export function IntegrationsPage() {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [records, setRecords] = useState<IntegrationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await getCurrentUser();
      setCsrfToken(user.csrfToken);
      const response = await listIntegrations();
      setRecords(response.integrations);
    } catch (err) {
      setError(formatDevError(err, "Could not load integrations."));
      setRecords(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const proxmoxRecords =
    records?.filter((item) => item.type === "proxmox") ?? [];
  const showForm = !loading && proxmoxRecords.length === 0 && csrfToken;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Connect Rackora to the tools running in your homelab."
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index} className="p-5" data-testid="loading-skeleton">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-2 h-4 w-20" />
              <Skeleton className="mt-4 h-4 w-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={() => void reload()} />
      ) : (
        <div className="space-y-6">
          {proxmoxRecords.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {proxmoxRecords.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                />
              ))}
            </div>
          ) : showForm ? null : (
            <EmptyState
              icon={Plug}
              title="Sign in required"
              description="Sign in to configure integrations."
              action={
                <Link
                  to="/login"
                  className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  Sign in
                </Link>
              }
            />
          )}

          {showForm ? (
            <ProxmoxForm csrfToken={csrfToken} onSaved={() => void reload()} />
          ) : null}

          {proxmoxRecords.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              <Server className="mr-1 inline size-3.5" aria-hidden />
              Additional Proxmox clusters can be added in a later release.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
