import { Briefcase } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { requirePortal, requiresTwoFactor } from "@/lib/session";
import { requirePortalSociety } from "@/lib/society";
import { savedTheme } from "@/lib/theme";
import { PortalNav } from "./portal-nav";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePortal();
  const society = await requirePortalSociety();
  const isOfficer = me.societies.some((s) => requiresTwoFactor(s.roles));
  const links = [
    { href: "/my", label: "Home", icon: "home" as const },
    { href: "/my/statement", label: "Statement", icon: "statement" as const },
    ...(society.modules.includes("loans") ? [{ href: "/my/apply", label: "Apply for a loan", icon: "loan" as const }] : []),
  ];
  return (
    <div
      className={society.brandColor ? "branded min-h-screen" : "min-h-screen"}
      style={society.brandColor ? ({ "--brand": society.brandColor } as React.CSSProperties) : undefined}
    >
      <header data-print-hide className="border-border bg-surface/90 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link href="/my" className="flex min-w-0 items-center gap-3">
            <Logo sub={false} className="hidden sm:inline-flex" />
            <span className="bg-border hidden h-6 w-px sm:block" aria-hidden />
            <span className="truncate text-sm font-medium">{society.shortName || society.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {isOfficer && (
              <Link href="/overview" className="text-muted hover:bg-surface-2 hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm sm:flex">
                <Briefcase className="size-4" aria-hidden />
                Officer workspace
              </Link>
            )}
            <ThemeToggle initial={await savedTheme()} />
            <UserMenu name={me.user.name} email={me.user.email} />
          </div>
        </div>
        <PortalNav links={links} />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="animate-in flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
