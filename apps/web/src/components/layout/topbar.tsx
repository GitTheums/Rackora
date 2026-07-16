import { Menu } from "lucide-react";
import type { DashboardOverview, ServiceState } from "@rackora/shared";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { StatusDot } from "@/components/dashboard/status";
import { useApiResource } from "@/hooks/use-api-resource";
import { getOverview } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Derive topbar health from the dashboard overview API payload. */
export function deriveOverallHealth(
  overview: DashboardOverview | null,
): { state: ServiceState; label: string } {
  if (!overview) {
    return { state: "unknown", label: "Loading status…" };
  }

  if (!overview.proxmox.connected) {
    return { state: "down", label: "Proxmox not connected" };
  }

  switch (overview.proxmox.healthStatus) {
    case "healthy":
      return { state: "healthy", label: "All systems operational" };
    case "degraded":
      return overview.proxmox.stale
        ? { state: "degraded", label: "Data may be stale" }
        : { state: "degraded", label: "Minor issues" };
    case "down":
      return { state: "down", label: "Attention needed" };
    default:
      return { state: "unknown", label: "Status unknown" };
  }
}

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const overviewResource = useApiResource(
    (signal) => getOverview().then((data) => {
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return data;
    }),
    { staleTime: 30_000, refetchInterval: 60_000 },
  );

  const health = deriveOverallHealth(
    overviewResource.status === "success" ? overviewResource.data : null,
  );

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-topbar/95 px-4 backdrop-blur sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
      >
        <Menu aria-hidden />
      </Button>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium",
            health.state === "healthy"
              ? "text-success"
              : health.state === "degraded"
                ? "text-warning"
                : health.state === "unknown"
                  ? "text-muted-foreground"
                  : "text-destructive",
          )}
        >
          <StatusDot state={health.state} />
          {health.label}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
