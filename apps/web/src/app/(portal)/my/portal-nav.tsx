"use client";

import { FileText, HandCoins, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const ICONS = { home: Home, statement: FileText, loan: HandCoins };

export function PortalNav({ links }: { links: { href: string; label: string; icon: keyof typeof ICONS }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Member portal" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 sm:px-6">
      {links.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = href === "/my" ? pathname === "/my" || pathname.startsWith("/my/loans") : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "border-accent text-foreground" : "text-muted hover:text-foreground border-transparent",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
