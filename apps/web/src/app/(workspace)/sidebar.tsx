"use client";

import { BookOpen, LayoutDashboard, Scale, ShieldCheck, Users, KeyRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { cn } from "@/components/ui/cn";
import { switchSociety } from "./actions";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/members", label: "Members", icon: Users },
  { href: "/ledger", label: "Journal", icon: BookOpen },
  { href: "/trial-balance", label: "Trial balance", icon: Scale },
  { href: "/audit", label: "Audit trail", icon: ShieldCheck },
];

const ROLE_LABELS: Record<string, string> = {
  principal_officer: "Principal officer",
  chairperson: "Chairperson",
  secretary: "Secretary",
  treasurer: "Treasurer",
  loan_officer: "Loan officer",
  loan_committee: "Loan committee",
  payroll_officer: "Payroll officer",
  auditor: "Auditor",
  member: "Member",
};

export function Sidebar({
  user,
  current,
  societies,
}: {
  user: { name: string; email: string };
  current: { id: string; name: string; roles: string[] };
  societies: { id: string; name: string }[];
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
        <p className="text-muted text-xs">{current.roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")}</p>
      </div>
      <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto md:flex-col">
        {NAV.map(({ href, label, icon: Icon }) => {
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
