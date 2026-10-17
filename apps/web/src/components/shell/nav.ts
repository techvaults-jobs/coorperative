import type { Permission } from "@techvaults/core";
import { BookOpen, ClipboardCheck, LayoutDashboard, Scale, ShieldCheck, UserCog, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to roles holding any one of these permissions. */
  anyOf?: Permission[];
  keywords?: string;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "", items: [{ href: "/overview", label: "Overview", icon: LayoutDashboard, keywords: "dashboard home" }] },
  { label: "Membership", items: [{ href: "/members", label: "Members", icon: Users, anyOf: ["members.read"], keywords: "register people" }] },
  {
    label: "Finance",
    items: [
      { href: "/ledger", label: "Journal", icon: BookOpen, anyOf: ["ledger.read"], keywords: "entries ledger post" },
      { href: "/approvals", label: "Approvals", icon: ClipboardCheck, anyOf: ["ledger.approve", "ledger.prepare"], keywords: "maker checker pending" },
      { href: "/trial-balance", label: "Trial balance", icon: Scale, anyOf: ["ledger.read"], keywords: "accounts totals" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/officers", label: "Officers", icon: UserCog, anyOf: ["officers.manage"], keywords: "users roles invite" },
      { href: "/audit", label: "Audit trail", icon: ShieldCheck, anyOf: ["audit.read"], keywords: "history log" },
    ],
  },
];

export function visibleGroups(permissions: readonly Permission[]) {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.anyOf || i.anyOf.some((p) => permissions.includes(p))) })).filter((g) => g.items.length);
}
