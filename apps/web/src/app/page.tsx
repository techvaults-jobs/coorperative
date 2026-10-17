import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  ClipboardCheck,
  Fingerprint,
  HandCoins,
  Landmark,
  Layers,
  Lock,
  ShieldCheck,
  Sprout,
  Store,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { COMPANY, Logo, PRODUCT } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

const SECTORS = [
  { icon: Building2, title: "Staff & workplace", body: "Payroll-deduction societies for companies, universities and public agencies." },
  { icon: Sprout, title: "Agricultural", body: "Farmer groups with seasonal contributions, input loans and produce sales." },
  { icon: Truck, title: "Transport", body: "Drivers' and operators' unions with daily or weekly levies." },
  { icon: Store, title: "Market & traders", body: "Thrift, esusu and credit circles for market associations." },
  { icon: Layers, title: "Multipurpose", body: "Savings, credit, consumer and investment arms under one register." },
  { icon: Landmark, title: "Credit unions", body: "Thrift and credit societies with share capital and dividend cycles." },
];

const FEATURES = [
  { icon: Users, title: "Member register", body: "Every member's profile, nominee, status and full statement in one place." },
  { icon: Wallet, title: "Savings & shares", body: "Configurable products per society, with balances straight from the ledger." },
  { icon: HandCoins, title: "Loans", body: "Applications, guarantors, committee approval, schedules and arrears." },
  { icon: ClipboardCheck, title: "Maker-checker", body: "Nothing is posted until a second officer approves it. No exceptions." },
  { icon: BarChart3, title: "Reports & AGM packs", body: "Trial balance, statements and dashboards that always reconcile." },
  { icon: Fingerprint, title: "Tamper-evident audit", body: "Each change is hash-chained to the last, so history can't be quietly edited." },
];

export default async function Home() {
  const health = await checkHealth();
  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/60 bg-background/80 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <a href="#features" className="text-muted hover:text-foreground hidden px-3 text-sm sm:block">
              Features
            </a>
            <a href="#sectors" className="text-muted hover:text-foreground hidden px-3 text-sm sm:block">
              Sectors
            </a>
            <a href="#security" className="text-muted hover:text-foreground hidden px-3 text-sm sm:block">
              Security
            </a>
            <Link href="/sign-in" className={buttonClass("primary")}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-0"
          style={{
            background:
              "radial-gradient(50% 60% at 15% 0%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%), radial-gradient(40% 50% at 95% 20%, color-mix(in oklab, var(--gold) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="flex flex-col gap-6">
            <span className="border-border bg-surface text-muted inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium shadow-sm">
              <span className="bg-accent size-1.5 rounded-full" aria-hidden />A {COMPANY} product
            </span>
            <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              The secure vault for your <span className="text-accent">cooperative&apos;s</span> money and members.
            </h1>
            <p className="text-muted max-w-xl text-lg leading-relaxed">
              {PRODUCT} runs savings, shares, loans, payroll deductions and accounts for cooperative societies of every sector, configured to each
              society&apos;s own bye-laws and approved rules.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/sign-in" className={buttonClass("primary", undefined, "lg")}>
                Sign in to your society
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a href="#features" className={buttonClass("secondary", undefined, "lg")}>
                See what&apos;s inside
              </a>
            </div>
            <ul className="text-muted flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {["Double-entry ledger", "Maker-checker approvals", "Two-factor sign-in"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <BadgeCheck className="text-accent size-4" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Everything in one place" title="Run the whole society, not just the books." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="border-border bg-surface group rounded-2xl border p-6 shadow-sm transition-shadow hover:shadow-md">
              <span className="bg-accent-soft text-accent flex size-10 items-center justify-center rounded-xl">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="text-muted mt-1.5 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="sectors" className="border-border bg-surface border-y">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Built for every sector" title="One platform, configured to how your society works." />
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {SECTORS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-surface flex gap-4 p-6">
                <Icon className="text-gold mt-0.5 size-5 shrink-0" aria-hidden />
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-muted mt-1 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="bg-sidebar relative overflow-hidden rounded-3xl px-6 py-12 sm:px-12">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "radial-gradient(50% 80% at 100% 0%, color-mix(in oklab, var(--accent) 30%, transparent), transparent 70%)" }}
          />
          <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="flex flex-col gap-4">
              <p className="text-sidebar-accent text-xs font-semibold tracking-widest uppercase">Security by design</p>
              <h2 className="text-3xl font-semibold tracking-tight text-balance text-white">Controls auditors expect, enforced by the database itself.</h2>
              <p className="text-sidebar-foreground leading-relaxed">
                Guardrails live below the application, so even a software bug can&apos;t post an unbalanced entry, approve its own work or read another
                society&apos;s data.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: Lock, t: "Society isolation", b: "Row-level security on every table" },
                { icon: ShieldCheck, t: "Append-only ledger", b: "Corrections by linked reversal" },
                { icon: Fingerprint, t: "Hash-chained audit", b: "Tampering is detectable" },
                { icon: ClipboardCheck, t: "Separation of duties", b: "Preparer can never approve" },
              ].map(({ icon: Icon, t, b }) => (
                <li key={t} className="border-sidebar-border bg-sidebar-2/80 rounded-xl border p-4">
                  <Icon className="text-sidebar-accent size-5" aria-hidden />
                  <p className="mt-3 text-sm font-semibold text-white">{t}</p>
                  <p className="text-sidebar-muted text-xs">{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-border border-t">
        <div className="text-muted mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <p className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${health.ok ? "bg-success" : "bg-danger"}`} aria-hidden />
            {health.ok ? "All systems operational" : "Database unavailable"} · Preview environment, synthetic data only
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="text-accent text-xs font-semibold tracking-widest uppercase">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
    </div>
  );
}

/** A stylised, illustrative dashboard (static figures) for the hero. */
function ProductPreview() {
  const bars = [38, 52, 47, 61, 58, 72, 66, 80, 76, 88, 84, 96];
  return (
    <div aria-hidden className="relative">
      <div className="border-border bg-surface rounded-2xl border p-2 shadow-lg">
        <div className="bg-surface-2 flex items-center gap-1.5 rounded-t-xl px-3 py-2">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="grid grid-cols-[88px_1fr] gap-0 overflow-hidden rounded-b-xl">
          <div className="bg-sidebar flex flex-col gap-2 p-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <span key={i} className={`h-2 rounded-full ${i === 1 ? "bg-sidebar-accent w-12" : "bg-sidebar-border w-14"}`} />
            ))}
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Savings", "₦48.2M"],
                ["Shares", "₦12.9M"],
                ["Loans", "₦31.4M"],
              ].map(([l, v]) => (
                <div key={l} className="border-border rounded-lg border p-2.5">
                  <p className="text-muted text-[10px]">{l}</p>
                  <p className="text-sm font-semibold">{v}</p>
                </div>
              ))}
            </div>
            <div className="border-border rounded-lg border p-3">
              <p className="text-muted mb-3 text-[10px]">Monthly contributions</p>
              <div className="flex h-28 items-end gap-1.5">
                {bars.map((h, i) => (
                  <span key={i} className="bg-accent flex-1 rounded-t-[3px]" style={{ height: `${h}%`, opacity: i === bars.length - 1 ? 1 : 0.55 }} />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {["Regular loan – DSC-0014", "October payroll remittance"].map((t, i) => (
                <div key={t} className="border-border flex items-center justify-between rounded-md border px-2.5 py-1.5">
                  <span className="text-[11px]">{t}</span>
                  <span className={`rounded-full px-1.5 text-[9px] font-medium ${i === 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
                    {i === 0 ? "Awaiting approval" : "Posted"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="border-border bg-surface absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-xl border px-4 py-3 shadow-md sm:flex">
        <span className="bg-success-soft text-success flex size-9 items-center justify-center rounded-lg">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold">Audit chain verified</p>
          <p className="text-muted text-[11px]">2,481 records · just now</p>
        </div>
      </div>
    </div>
  );
}
