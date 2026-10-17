"use client";

import type { Permission } from "@techvaults/core";
import { BookOpen, ClipboardCheck, KeyRound, LayoutDashboard, Scale, ShieldCheck, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { cn } from "@/components/ui/cn";
import { roleLabel } from "@/lib/roles";
import { switchSociety } from "./actions";

/** Each link shows only to people whose role can use the page (any one of the listed permissions). */
const NAV: { href: string; label: string; icon: typeof Users; anyOf?: Permission[] }[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/members", label: "Members", icon: Users, anyOf: ["members.read"] },
  { href: "/ledger", label: "Journal", icon: BookOpen, anyOf: ["ledger.read"] },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck, anyOf: ["ledger.approve", "ledger.prepare"] },
  { href: "/trial-balance", label: "Trial balance", icon: Scale, anyOf: ["ledger.read"] },
  { href: "/audit", label: "Audit trail", icon: ShieldCheck, anyOf: ["audit.read"] },
  { href: "/officers", label: "Officers", icon: UserCog, anyOf: ["officers.manage"] },
];

export function Sidebar({
  user,
  current,
  societies,
  permissions,
  pendingApprovals,
}: {
  user: { name: string; email: string };
  current: { id: string; name: string; roles: string[] };
  societies: { id: string; name: string }[];
  permissions: Permission[];
  pendingApprovals: number;
}) {
  const pathname = usePathname();
  return (
    <aside className="border-border bg-surface flex flex-col gap-6 border-b px-4 py-5 md:sticky md:top-0 md:h-[calc(100vh-2.25rem)] md:w-64 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex flex-col gap-2">
        <span className="text-muted font-mono text-[11px] tracking-widest uppercase">TechVaults Cooperative</span>
        {societies.length > 1 ? (
          <form action={switchSociety}>
            <label htmlFor="society" className="sr-only">
              Society
            </label>
            <select
              id="society"
              name="societyId"
              defaultValue={current.id}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="border-border bg-surface w-full rounded-md border px-2 py-1.5 text-sm font-semibold"
            >
              {societies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <p className="text-sm leading-snug font-semibold">{current.name}</p>
        )}
        <p className="text-muted text-xs">{current.roles.map(roleLabel).join(" · ")}</p>
      </div>
      <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto md:flex-col">
        {NAV.filter((item) => !item.anyOf || item.anyOf.some((p) => permissions.includes(p))).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm whitespace-nowrap transition-colors",
                active ? "bg-accent-soft text-accent font-medium" : "text-muted hover:bg-accent-soft hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
              {href === "/approvals" && pendingApprovals > 0 && (
                <span className="bg-warning-soft text-warning ml-auto rounded-full px-1.5 text-xs font-semibold tabular-nums">
                  {pendingApprovals}
                  <span className="sr-only"> waiting</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-border mt-auto flex flex-wrap items-center gap-1 md:flex-col md:items-stretch md:border-t md:pt-4">
        <p className="hidden truncate text-sm font-medium md:block">{user.name}</p>
        <p className="text-muted hidden truncate text-xs md:block">{user.email}</p>
        <Link href="/security" className="text-muted hover:bg-accent-soft flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm md:mt-2">
          <KeyRound className="size-4" aria-hidden />
          Security
        </Link>
        <SignOutButton compact />
      </div>
    </aside>
  );
}
