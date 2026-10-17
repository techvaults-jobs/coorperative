"use client";

import { usePathname } from "next/navigation";
import { LinkTabs } from "@/components/ui/tabs";

const TABS = [
  { key: "/settings", href: "/settings", label: "General" },
  { key: "/settings/branding", href: "/settings/branding", label: "Branding" },
  { key: "/settings/sector", href: "/settings/sector", label: "Sector & modules" },
  { key: "/settings/accounts", href: "/settings/accounts", label: "Chart of accounts" },
];

export function SettingsTabs() {
  return <LinkTabs label="Settings sections" tabs={TABS} current={usePathname()} />;
}
