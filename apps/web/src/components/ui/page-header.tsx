import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        {back && (
          <Link href={back.href} className="text-muted hover:text-foreground w-fit text-xs font-medium transition-colors">
            ← {back.label}
          </Link>
        )}
        {eyebrow && <p className="text-accent text-xs font-semibold tracking-wider uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">{title}</h1>
        {description && <p className="text-muted max-w-2xl text-sm leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children, icon: Icon = Inbox, action, className }: { title: string; children?: ReactNode; icon?: LucideIcon; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("border-border bg-surface flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center", className)}>
      <span className="bg-accent-soft text-accent flex size-11 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted max-w-md text-sm">{children}</div>}
      {action}
    </div>
  );
}
