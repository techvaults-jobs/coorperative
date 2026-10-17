import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "good" | "warning" | "danger" | "info" | "gold" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted ring-border",
  good: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
  gold: "bg-gold-soft text-gold ring-gold/25",
  accent: "bg-accent-soft text-accent ring-accent/20",
};

export function Badge({ tone = "neutral", dot = false, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
