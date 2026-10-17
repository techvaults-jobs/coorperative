import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkline } from "../charts/trend-chart";
import { cn } from "./cn";

/** Stat tile: label, value, optional change vs a named period and a 12-point trend. */
export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  trend,
  footnote,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  delta?: { text: string; direction: "up" | "down" | "flat"; good: boolean };
  trend?: number[];
  footnote?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-border bg-surface flex flex-col gap-3 rounded-xl border p-5 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-[13px] font-medium">{label}</p>
        {trend ? (
          <Sparkline values={trend} className="shrink-0" />
        ) : (
          Icon && (
            <span className="bg-accent-soft text-accent flex size-8 items-center justify-center rounded-lg">
              <Icon className="size-4" aria-hidden />
            </span>
          )
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          {delta && (
            <p className={cn("text-xs font-medium", delta.direction === "flat" ? "text-muted" : delta.good ? "text-success" : "text-danger")}>
              {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "•"} {delta.text}
            </p>
          )}
          {footnote && <p className="text-muted text-xs">{footnote}</p>}
        </div>
      </div>
    </div>
  );
}
