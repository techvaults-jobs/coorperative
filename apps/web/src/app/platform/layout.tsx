import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { requirePlatformStaff } from "@/lib/session";
import { savedTheme } from "@/lib/theme";
import { PlatformNav } from "./platform-nav";

export const dynamic = "force-dynamic";

/** TechVaults staff console: onboarding and supporting societies. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requirePlatformStaff();
  return (
    <div className="min-h-screen">
      <header className="bg-sidebar sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/platform">
            <Logo tone="inverse" sub={false} />
          </Link>
          <span className="bg-gold rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">Staff console</span>
          <div className="ml-auto flex items-center gap-1 [&_button]:text-sidebar-foreground">
            {viewer.societies.length > 0 && (
              <Link href="/overview" className="text-sidebar-foreground hidden rounded-lg px-3 py-2 text-sm hover:text-white sm:block">
                Society workspace
              </Link>
            )}
            <ThemeToggle initial={await savedTheme()} />
            <UserMenu name={viewer.user.name} email={viewer.user.email} />
          </div>
        </div>
        <PlatformNav />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animate-in flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
