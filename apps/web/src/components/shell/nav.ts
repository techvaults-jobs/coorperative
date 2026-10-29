import type { Module, Permission } from "@techvaults/core";
import { Banknote, BookOpen, ClipboardCheck, ClipboardList, FileBarChart, FileSpreadsheet, HandCoins, LayoutDashboard, Package, Scale, Settings, ShieldCheck, UserCog, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to roles holding any one of these permissions. */
  anyOf?: Permission[];
  /** Shown only when the society has this module switched on. */
  module?: Module;
  keywords?: string;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "", items: [{ href: "/overview", label: "Overview", icon: LayoutDashboard, keywords: "dashboard home" }] },
  { label: "Membership", items: [{ href: "/members", label: "Members", icon: Users, anyOf: ["members.read"], keywords: "register people" }] },
  {
    label: "Lending & savings",
    items: [
      { href: "/loans", label: "Loans", icon: HandCoins, anyOf: ["loans.prepare", "loans.approve", "ledger.read"], module: "loans", keywords: "credit borrow applications repayments arrears" },
      { href: "/withdrawals", label: "Withdrawals", icon: Banknote, anyOf: ["ledger.prepare", "ledger.approve", "members.write", "ledger.read"], module: "savings", keywords: "withdraw savings payout" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/ledger", label: "Journal", icon: BookOpen, anyOf: ["ledger.read"], keywords: "entries ledger post" },
      { href: "/collections", label: "Collections", icon: ClipboardList, anyOf: ["collections.manage", "ledger.read"], module: "collections", keywords: "weekly meeting contributions cash card sheet thrift" },
      { href: "/payroll", label: "Payroll deductions", icon: FileSpreadsheet, anyOf: ["payroll.manage"], module: "payroll", keywords: "remittance employer schedule reconciliation ippis" },
      { href: "/approvals", label: "Approvals", icon: ClipboardCheck, anyOf: ["ledger.approve", "ledger.prepare"], keywords: "maker checker pending" },
      { href: "/trial-balance", label: "Trial balance", icon: Scale, anyOf: ["ledger.read"], keywords: "accounts totals" },
      { href: "/reports", label: "Reports", icon: FileBarChart, anyOf: ["ledger.read"], keywords: "balance sheet financial position income expenditure agm statement aging" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/products", label: "Products", icon: Package, anyOf: ["settings.manage", "accounts.manage", "settings.approve"], keywords: "savings shares loan products rates policy" },
      { href: "/officers", label: "Officers", icon: UserCog, anyOf: ["officers.manage", "settings.approve"], keywords: "users roles invite" },
      { href: "/audit", label: "Audit trail", icon: ShieldCheck, anyOf: ["audit.read"], keywords: "history log" },
      { href: "/settings", label: "Settings", icon: Settings, anyOf: ["settings.manage", "accounts.manage"], keywords: "society profile branding colour sector modules chart of accounts" },
    ],
  },
];

export function visibleGroups(permissions: readonly Permission[], modules: readonly Module[]) {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.anyOf || i.anyOf.some((p) => permissions.includes(p))) && (!i.module || modules.includes(i.module))),
  })).filter((g) => g.items.length);
}
