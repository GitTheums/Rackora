import type { ServiceState, Severity } from "@rackora/shared";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const STATE_META: Record<
  ServiceState,
  { label: string; variant: BadgeVariant; dot: string }
> = {
  healthy: { label: "Healthy", variant: "success", dot: "bg-success" },
  degraded: { label: "Degraded", variant: "warning", dot: "bg-warning" },
  down: { label: "Down", variant: "destructive", dot: "bg-destructive" },
  unknown: { label: "Unknown", variant: "muted", dot: "bg-muted-foreground" },
};

const SEVERITY_META: Record<
  Severity,
  { label: string; variant: BadgeVariant; dot: string }
> = {
  info: { label: "Info", variant: "info", dot: "bg-primary" },
  warning: { label: "Warning", variant: "warning", dot: "bg-warning" },
  critical: { label: "Critical", variant: "destructive", dot: "bg-destructive" },
};

export function StatusDot({
  state,
  className,
}: {
  state: ServiceState;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 rounded-full",
        STATE_META[state].dot,
        className,
      )}
    />
  );
}

export function StatusBadge({ state }: { state: ServiceState }) {
  const meta = STATE_META[state];
  return (
    <Badge variant={meta.variant}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity];
  return (
    <Badge variant={meta.variant}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </Badge>
  );
}

/** Choose a Tailwind text color class based on a usage percentage. */
export function usageTone(percent: number): string {
  if (percent >= 90) {
    return "text-destructive";
  }
  if (percent >= 75) {
    return "text-warning";
  }
  return "text-foreground";
}

/** Choose a progress-bar indicator color class based on a usage percentage. */
export function usageIndicator(percent: number): string {
  if (percent >= 90) {
    return "bg-destructive";
  }
  if (percent >= 75) {
    return "bg-warning";
  }
  return "bg-primary";
}
