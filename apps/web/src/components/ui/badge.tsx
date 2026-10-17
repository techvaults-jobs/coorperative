import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "good" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-border/60 text-foreground",
  good: "bg-accent-soft text-accent",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>{children}</span>;
}
