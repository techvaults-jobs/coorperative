import Link from "next/link";
import { cn } from "./cn";

/** Tabs that are links, so each view has its own URL and works without JavaScript. */
export function LinkTabs({ tabs, current, label }: { tabs: { href: string; label: string; count?: number; key: string }[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="border-border -mb-px flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "border-accent text-foreground" : "text-muted hover:text-foreground border-transparent",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
