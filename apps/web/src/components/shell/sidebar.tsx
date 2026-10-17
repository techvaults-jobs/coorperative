"use client";

import type { Permission } from "@techvaults/core";
import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { switchSociety } from "@/app/(workspace)/actions";
import { Logo } from "@/components/brand";
import { cn } from "@/components/ui/cn";
import { roleLabel } from "@/lib/roles";
import { visibleGroups } from "./nav";

export interface ShellProps {
  user: { name: string; email: string };
  current: { id: string; name: string; roles: string[] };
  societies: { id: string; name: string }[];
  permissions: Permission[];
  pendingApprovals: number;
}

export function SidebarContent({ current, societies, permissions, pendingApprovals, onNavigate }: ShellProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <Link href="/overview" className="px-2" onClick={onNavigate}>
        <Logo tone="inverse" />
      </Link>

      <div className="border-sidebar-border bg-sidebar-2 rounded-xl border p-3">
        <p className="text-sidebar-muted text-[10px] font-semibold tracking-widest uppercase">Society</p>
        {societies.length > 1 ? (
          <form action={switchSociety} className="relative mt-1">
            <label htmlFor="society" className="sr-only">
              Switch society
            </label>
            <select
              id="society"
              name="societyId"
              defaultValue={current.id}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full cursor-pointer appearance-none bg-transparent pr-6 text-sm font-semibold text-white outline-none"
            >
              {societies.map((s) => (
                <option key={s.id} value={s.id} className="text-black">
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronsUpDown className="text-sidebar-muted pointer-events-none absolute top-0.5 right-0 size-4" aria-hidden />
          </form>
        ) : (
          <p className="mt-1 text-sm leading-snug font-semibold text-white">{current.name}</p>
        )}
        <p className="text-sidebar-muted mt-1 text-xs">{current.roles.map(roleLabel).join(" · ")}</p>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {visibleGroups(permissions).map((group) => (
          <div key={group.label || "home"} className="flex flex-col gap-0.5">
            {group.label && <p className="text-sidebar-muted px-2.5 pb-1.5 text-[10px] font-semibold tracking-widest uppercase">{group.label}</p>}
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active ? "bg-sidebar-2 font-medium text-white" : "text-sidebar-foreground hover:bg-sidebar-2/70 hover:text-white",
                  )}
                >
                  {active && <span className="bg-sidebar-accent absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full" aria-hidden />}
                  <Icon className={cn("size-[18px]", active ? "text-sidebar-accent" : "text-sidebar-muted group-hover:text-sidebar-foreground")} aria-hidden />
                  {label}
                  {href === "/approvals" && pendingApprovals > 0 && (
                    <span className="bg-gold ml-auto rounded-full px-1.5 text-[11px] font-semibold text-white tabular-nums">
                      {pendingApprovals}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <p className="text-sidebar-muted px-2.5 text-[11px] leading-relaxed">Preview environment · synthetic data only</p>
    </div>
  );
}
