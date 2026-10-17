"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const LINKS = [
  { href: "/platform", label: "Societies" },
  { href: "/platform/societies/new", label: "Onboard a society" },
  { href: "/platform/leads", label: "Demo requests" },
  { href: "/platform/outbox", label: "Email outbox" },
];

export function PlatformNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Staff console" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
              active ? "border-sidebar-accent text-white" : "text-sidebar-muted border-transparent hover:text-white",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
