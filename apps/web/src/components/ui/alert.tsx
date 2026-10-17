import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

const TONES = {
  success: { cls: "bg-success-soft text-success border-success/20", Icon: CheckCircle2 },
  warning: { cls: "bg-warning-soft text-warning border-warning/20", Icon: AlertTriangle },
  danger: { cls: "bg-danger-soft text-danger border-danger/20", Icon: XCircle },
  info: { cls: "bg-info-soft text-info border-info/20", Icon: Info },
} as const;

/** A status message with an icon, so meaning never rests on colour alone. */
export function Alert({ tone = "info", title, children, actions, className }: { tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  const { cls, Icon } = TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("animate-in flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          {title && <p className="font-medium">{title}</p>}
          {children && <div className={title ? "opacity-90" : undefined}>{children}</div>}
        </div>
        {actions}
      </div>
    </div>
  );
}
