"use client";

import { Bell, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import { CommandPalette } from "./command-palette";
import { SidebarContent, type ShellProps } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function Topbar(props: ShellProps & { theme: "system" | "light" | "dark" }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  useEffect(() => setDrawer(false), [pathname]);
  const canApprovals = props.permissions.includes("ledger.approve") || props.permissions.includes("ledger.prepare");

  return (
    <>
      <header data-print-hide className="border-border bg-background/80 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open navigation"
          className="text-muted hover:bg-surface-2 flex size-9 items-center justify-center rounded-lg lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("cv:command"))}
          className="border-border bg-surface text-subtle hover:border-border-strong flex h-10 max-w-md min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-3 text-sm shadow-sm transition-colors"
        >
          <Search className="size-4" aria-hidden />
          <span className="truncate">Search pages and members…</span>
          <kbd className="border-border ml-auto hidden rounded border px-1.5 py-0.5 font-sans text-[10px] sm:inline">⌘K</kbd>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          {canApprovals && (
            <Link
              href="/approvals"
              aria-label={props.pendingApprovals ? `${props.pendingApprovals} entries waiting for approval` : "Approvals"}
              className="text-muted hover:bg-surface-2 hover:text-foreground relative flex size-9 items-center justify-center rounded-lg"
            >
              <Bell className="size-[18px]" aria-hidden />
              {props.pendingApprovals > 0 && <span className="bg-gold ring-background absolute top-2 right-2 size-2 rounded-full ring-2" aria-hidden />}
            </Link>
          )}
          <ThemeToggle initial={props.theme} />
          <span className="bg-border mx-1 hidden h-6 w-px sm:block" aria-hidden />
          <UserMenu name={props.user.name} email={props.user.email} />
        </div>
      </header>

      <div className={cn("fixed inset-0 z-40 lg:hidden", drawer ? "visible" : "invisible")} aria-hidden={!drawer}>
        <div className={cn("absolute inset-0 bg-black/50 transition-opacity", drawer ? "opacity-100" : "opacity-0")} onClick={() => setDrawer(false)} />
        <aside className={cn("bg-sidebar absolute inset-y-0 left-0 w-72 transition-transform", drawer ? "translate-x-0" : "-translate-x-full")}>
          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label="Close navigation"
            className="text-sidebar-muted absolute top-5 right-3 flex size-8 items-center justify-center rounded-lg hover:text-white"
          >
            <X className="size-5" aria-hidden />
          </button>
          {drawer && <SidebarContent {...props} onNavigate={() => setDrawer(false)} />}
        </aside>
      </div>

      <CommandPalette permissions={props.permissions} modules={props.modules} />
    </>
  );
}
