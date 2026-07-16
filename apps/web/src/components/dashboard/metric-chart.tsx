import { useId } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import type { MetricPoint } from "@rackora/shared";
import { cn } from "@/lib/utils";

interface MetricAreaChartProps {
  data: MetricPoint[];
  height?: number;
  /** Tailwind text color class; the line/fill use currentColor. */
  colorClassName?: string;
  unit?: string;
  showTooltip?: boolean;
  className?: string;
}

export function MetricAreaChart({
  data,
  height = 64,
  colorClassName = "text-primary",
  unit = "",
  showTooltip = false,
  className,
}: MetricAreaChartProps) {
  const gradientId = useId();

  return (
    <div
      className={cn(colorClassName, className)}
      style={{ height }}
      data-testid="metric-chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.32} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          {showTooltip ? (
            <Tooltip
              cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 12,
                boxShadow: "0 4px 16px var(--primary-glow)",
              }}
              labelFormatter={() => ""}
              formatter={(value) => [`${String(value)}${unit}`, ""]}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
