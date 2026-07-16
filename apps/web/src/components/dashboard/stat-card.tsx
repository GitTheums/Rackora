import { type ComponentType, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  badge,
  children,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("flex flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          {Icon ? <Icon className="size-4" aria-hidden /> : null}
          <span className="text-sm font-medium">{label}</span>
        </div>
        {badge}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>

      {children ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}
