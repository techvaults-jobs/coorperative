import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { Logo, LogoMark, PRODUCT } from "./brand";

const POINTS = [
  "Double-entry ledger with maker-checker approval on every entry",
  "Each society's data isolated and every change audit-chained",
  "Configurable for staff, agricultural, transport, market and multipurpose societies",
];

/** Split layout for sign-in and account pages: a brand panel beside the form. */
export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="bg-sidebar relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, color-mix(in oklab, var(--accent) 35%, transparent), transparent 70%), radial-gradient(50% 40% at 90% 90%, color-mix(in oklab, var(--gold) 22%, transparent), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "44px 44px" }}
        />
        <Logo tone="inverse" className="relative" />
        <div className="relative flex max-w-md flex-col gap-8">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance text-white">The secure home for your cooperative&apos;s money and members.</h2>
          <ul className="flex flex-col gap-4">
            {POINTS.map((p) => (
              <li key={p} className="text-sidebar-foreground flex items-start gap-3 text-sm leading-relaxed">
                <CheckCircle2 className="text-sidebar-accent mt-0.5 size-4 shrink-0" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sidebar-muted relative text-xs">
          {PRODUCT} is a TechVaults product · Preview environment with synthetic data only
        </p>
      </aside>
      <main className="flex flex-col justify-center px-4 py-12 sm:px-12">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
          <LogoMark className="size-10 lg:hidden" />
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <div className="text-muted text-sm leading-relaxed">{description}</div>}
          </div>
          {children}
          {footer && <div className="text-muted border-border border-t pt-6 text-xs">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
