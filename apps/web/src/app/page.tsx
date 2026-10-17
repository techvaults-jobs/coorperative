import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  Fingerprint,
  HandCoins,
  Landmark,
  Layers,
  Lock,
  Scale,
  ShieldCheck,
  Smartphone,
  Sprout,
  Store,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { COMPANY, Logo, PRODUCT } from "@/components/brand";
import { DemoForm } from "@/components/marketing/demo-form";
import { Faq } from "@/components/marketing/faq";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { checkHealth } from "@/lib/health";
import dashboardShot from "../../public/marketing/dashboard.jpg";
import loanShot from "../../public/marketing/loan.jpg";
import payrollShot from "../../public/marketing/payroll.jpg";
import portalShot from "../../public/marketing/portal.jpg";
import reportsShot from "../../public/marketing/reports.jpg";

export const dynamic = "force-dynamic";
export const metadata = {
  title: `${PRODUCT}: cooperative management software for Nigerian societies`,
  description:
    "Savings, loans, payroll deductions, accounts and a member portal in one secure system, configured to your society's bye-laws. A TechVaults product.",
};

const NAV = [
  ["#features", "Features"],
  ["#how", "How it works"],
  ["#sectors", "Who it's for"],
  ["#security", "Security"],
  ["#faq", "FAQ"],
] as const;

const PAINS: { icon: LucideIcon; pain: string; fix: string }[] = [
  {
    icon: CalendarClock,
    pain: "Month-end deductions take days",
    fix: "Send the employer a ready-made schedule, load what they paid, and see every shortfall and unknown staff ID in minutes.",
  },
  {
    icon: Users,
    pain: "Members queue for their statements",
    fix: "Members open their own savings, shares and loan balances online, and print a statement whenever they need one.",
  },
  {
    icon: HandCoins,
    pain: "Loan decisions get questioned",
    fix: "Every application is checked against the same approved rules, and the committee sees exactly why it qualifies.",
  },
  {
    icon: Scale,
    pain: "Audit season is a scramble",
    fix: "The books balance by design. Balance sheet, income statement and loan ageing are ready for the AGM at any time.",
  },
];

const SHOWCASE: { eyebrow: string; title: string; body: string; points: string[]; image: typeof loanShot; alt: string }[] = [
  {
    eyebrow: "Loans",
    title: "Fair, consistent loan decisions",
    body: "Set your loan products once: interest method, rate, limits, guarantors and fees. Every application is measured against them.",
    points: [
      "Live eligibility checklist and repayment schedule while you apply",
      "Committee approval by someone other than the person who recorded it",
      "Arrears, days overdue and portfolio-at-risk tracked automatically",
    ],
    image: loanShot,
    alt: "A loan's figures, repayment schedule and repayment form",
  },
  {
    eyebrow: "Payroll deductions",
    title: "Month-end in an afternoon, not a week",
    body: "Built for staff cooperatives that collect through the employer's payroll.",
    points: [
      "Deduction schedule from each member's contributions and loan instalments",
      "Download it for the employer; load their remittance file when it comes back",
      "Short, missing and unidentified deductions flagged before anything is posted",
    ],
    image: payrollShot,
    alt: "A payroll reconciliation matching each member's scheduled and remitted deduction",
  },
  {
    eyebrow: "Reports",
    title: "Books that are always AGM-ready",
    body: "Every report comes straight from approved entries, so it always agrees with the ledger.",
    points: [
      "Statement of financial position and income and expenditure for any date or period",
      "The 25% statutory reserve calculated for you",
      "Print or download for your auditor in one click",
    ],
    image: reportsShot,
    alt: "A statement of financial position showing assets, liabilities and members' funds",
  },
  {
    eyebrow: "Member portal",
    title: "Members see their own money, any time",
    body: "Invite members to a simple, private portal that works on any phone or computer.",
    points: ["Savings, shares and loan balances with recent activity", "Printable statements for any period", "Loan applications checked against your rules before they reach the committee"],
    image: portalShot,
    alt: "A member's portal showing savings, share capital and recent contributions",
  },
];

const STEPS = [
  { title: "Tell us about your society", body: "Choose your sector, your words and your colours, then set up savings, share and loan products to match your bye-laws." },
  { title: "Bring your members and officers", body: "Add your register and invite your executives, each with the right role. We help you bring existing records across." },
  { title: "Run your monthly cycle", body: "Record contributions and loans, reconcile payroll deductions, and approve every entry with a second officer." },
  { title: "Report with confidence", body: "Produce statements for members, the committee, the AGM and your auditor whenever they're needed." },
];

const AUDIENCES: { icon: LucideIcon; title: string; points: string[] }[] = [
  {
    icon: Building2,
    title: "For executives and officers",
    points: ["One place for the register, loans, deductions and accounts", "Clear roles: secretary, treasurer, chairperson, loan committee, auditor", "Approvals that protect officers as much as members"],
  },
  {
    icon: Smartphone,
    title: "For members",
    points: ["Your balances and statement without visiting the office", "Know your next loan payment and what's overdue", "Apply for a loan and see whether you qualify first"],
  },
  {
    icon: ClipboardCheck,
    title: "For auditors and supervisors",
    points: ["Double-entry books that always balance", "Every change recorded: who, what, when and why", "Trial balance and statements ready to download"],
  },
];

const SECTORS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Building2, title: "Staff and workplace", body: "Companies, universities, hospitals and public agencies collecting through payroll." },
  { icon: Sprout, title: "Agricultural", body: "Farmer groups with seasonal contributions, input loans and produce sales." },
  { icon: Truck, title: "Transport", body: "Drivers' and operators' unions collecting daily or weekly levies." },
  { icon: Store, title: "Market and traders", body: "Thrift and credit for market associations and trade groups." },
  { icon: Layers, title: "Multipurpose", body: "Savings, credit and other arms under one member register." },
  { icon: Landmark, title: "Thrift, credit and housing", body: "Share capital, savings towards goals, and loans for members." },
];

const FAQ = [
  {
    q: "Does Cooperative Vaults hold or move our money?",
    a: "No. Your money stays in your society's own bank accounts. Cooperative Vaults keeps your records: who has paid what, who owes what, and your accounts.",
  },
  {
    q: "Can it follow our own bye-laws and rules?",
    a: "Yes. Loan rates, limits, guarantors, fees and contribution amounts are set per society, and any change needs a second officer's approval. Loans keep the terms they were granted under even if you change a rule later.",
  },
  {
    q: "We're not a staff cooperative. Will it work for us?",
    a: "Yes. You choose your sector and the words your members use, such as Farmer ID, Stall number or Route, and switch off what you don't need, such as payroll deductions.",
  },
  {
    q: "Is our data kept apart from other societies?",
    a: "Yes. Each society's records are separated inside the database itself, not just on screen. Officers sign in with two-factor authentication, and every change is recorded in a tamper-evident audit trail.",
  },
  {
    q: "Do our members need a smartphone?",
    a: "No. The member portal works in any web browser, on a phone or a computer. Officers can also print any member's statement.",
  },
  {
    q: "What does it cost?",
    a: "Pricing depends on the size of your society and the modules you use. Request a demo and we'll walk you through it and give you a quote.",
  },
];

export default async function Home() {
  const health = await checkHealth();
  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/60 bg-background/85 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label={`${PRODUCT} home`}>
            <Logo />
          </Link>
          <nav aria-label="Site" className="hidden items-center gap-1 lg:flex">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="text-muted hover:text-foreground rounded-lg px-3 py-2 text-sm transition-colors">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className={buttonClass("ghost", "hidden sm:inline-flex")}>
              Sign in
            </Link>
            <a href="#demo" className={buttonClass("primary")}>
              Request a demo
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(55% 60% at 10% 0%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%), radial-gradient(45% 50% at 100% 10%, color-mix(in oklab, var(--gold) 14%, transparent), transparent 70%)",
            }}
          />
          <div className="relative mx-auto flex max-w-7xl flex-col items-center px-4 pt-16 pb-10 text-center sm:px-6 lg:pt-24">
            <span className="border-border bg-surface text-muted inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium shadow-sm">
              <span className="bg-accent size-1.5 rounded-full" aria-hidden />
              Built for Nigerian cooperative societies
            </span>
            <h1 className="mt-6 max-w-4xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Run your cooperative society with <span className="text-accent">clarity and confidence</span>
            </h1>
            <p className="text-muted mt-6 max-w-2xl text-lg leading-relaxed text-balance">
              {PRODUCT} brings your members, savings, loans, payroll deductions and accounts into one secure place. Executives spend less time on paperwork,
              members always know where they stand, and auditors find books that balance.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href="#demo" className={buttonClass("primary", undefined, "lg")}>
                Request a demo
                <ArrowRight className="size-4" aria-hidden />
              </a>
              <a href="#how" className={buttonClass("secondary", undefined, "lg")}>
                See how it works
              </a>
            </div>
            <ul className="text-muted mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
              {["Every entry approved by two officers", "Statements in seconds", "Books that always balance"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <BadgeCheck className="text-accent size-4" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto max-w-6xl px-4 pb-20 sm:px-6">
            <BrowserFrame>
              <Image src={dashboardShot} alt="The Cooperative Vaults dashboard: members, savings, share capital, loans and monthly contributions" priority sizes="(min-width: 1200px) 1150px, 100vw" />
            </BrowserFrame>
            <div className="border-border bg-surface absolute -bottom-2 left-8 hidden items-center gap-3 rounded-xl border px-4 py-3 shadow-lg md:flex">
              <span className="bg-success-soft text-success flex size-9 items-center justify-center rounded-lg">
                <ShieldCheck className="size-5" aria-hidden />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold">Approved by a second officer</p>
                <p className="text-muted text-xs">Nothing reaches the books on one person&apos;s say-so</p>
              </div>
            </div>
          </div>
        </section>

        {/* Problems */}
        <section className="border-border bg-surface border-y">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <SectionHeading eyebrow="Sound familiar?" title="The old way costs your society time, trust and sleep" center />
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {PAINS.map(({ icon: Icon, pain, fix }) => (
                <div key={pain} className="border-border bg-background flex gap-4 rounded-2xl border p-6">
                  <span className="bg-gold-soft text-gold flex size-11 shrink-0 items-center justify-center rounded-xl">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold">{pain}</h3>
                    <p className="text-muted mt-1.5 leading-relaxed">
                      <span className="text-accent font-medium">With {PRODUCT}: </span>
                      {fix}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature showcase */}
        <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Everything in one place" title="Built around how cooperatives actually work" center />
          <div className="mt-16 flex flex-col gap-24">
            {SHOWCASE.map((f, i) => (
              <div key={f.title} className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
                <div className={cn("flex flex-col gap-4", i % 2 === 1 && "lg:order-2")}>
                  <p className="text-accent text-xs font-semibold tracking-widest uppercase">{f.eyebrow}</p>
                  <h3 className="text-3xl font-semibold tracking-tight text-balance">{f.title}</h3>
                  <p className="text-muted text-lg leading-relaxed">{f.body}</p>
                  <ul className="mt-2 flex flex-col gap-3">
                    {f.points.map((p) => (
                      <li key={p} className="flex items-start gap-3">
                        <CheckCircle2 className="text-accent mt-0.5 size-5 shrink-0" aria-hidden />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <BrowserFrame>
                  <Image src={f.image} alt={f.alt} sizes="(min-width: 1024px) 640px, 100vw" />
                </BrowserFrame>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-border bg-surface scroll-mt-20 border-y">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <SectionHeading eyebrow="How it works" title="Up and running in four steps" center />
            <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative flex flex-col gap-3">
                  <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-full font-semibold">{i + 1}</span>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-muted leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Audiences */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Good for everyone in the society" title="Clear for officers, open for members, solid for auditors" center />
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {AUDIENCES.map(({ icon: Icon, title, points }) => (
              <div key={title} className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-7 shadow-sm">
                <span className="bg-accent-soft text-accent flex size-11 items-center justify-center rounded-xl">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <ul className="flex flex-col gap-2.5">
                  {points.map((p) => (
                    <li key={p} className="text-muted flex items-start gap-2.5 leading-relaxed">
                      <CheckCircle2 className="text-accent mt-1 size-4 shrink-0" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Sectors */}
        <section id="sectors" className="border-border bg-surface scroll-mt-20 border-y">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <SectionHeading eyebrow="Who it's for" title="One platform, set up the way your society works" center>
              Choose your sector and your words. A farmers&apos; society sees &ldquo;Farmer ID&rdquo; and &ldquo;Farm cluster&rdquo;; a staff society sees &ldquo;Staff
              ID&rdquo; and &ldquo;Department&rdquo;. Switch off anything you don&apos;t use.
            </SectionHeading>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SECTORS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="border-border bg-background flex gap-4 rounded-2xl border p-6">
                  <Icon className="text-gold mt-0.5 size-6 shrink-0" aria-hidden />
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="text-muted mt-1 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="bg-sidebar relative overflow-hidden rounded-3xl px-6 py-14 sm:px-12">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: "radial-gradient(50% 80% at 100% 0%, color-mix(in oklab, var(--accent) 30%, transparent), transparent 70%)" }}
            />
            <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
              <div className="flex flex-col gap-4">
                <p className="text-sidebar-accent text-xs font-semibold tracking-widest uppercase">Trust and security</p>
                <h2 className="text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">Protecting members&apos; money starts with honest records</h2>
                <p className="text-sidebar-foreground text-lg leading-relaxed">
                  Your money never leaves your society&apos;s bank. {PRODUCT} keeps the records, and builds in the controls auditors look for, so mistakes and
                  fraud are much harder to hide.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: ClipboardCheck, t: "Two officers, every time", b: "Whoever prepares an entry can never approve it." },
                  { icon: Fingerprint, t: "Tamper-evident history", b: "Every change is chained to the last, so edits show." },
                  { icon: Lock, t: "Your society only", b: "Each society's records are walled off in the database." },
                  { icon: ShieldCheck, t: "Two-factor sign-in", b: "Officers confirm sign-in with an authenticator app." },
                  { icon: Wallet, t: "No money held", b: "We keep records; your bank keeps your money." },
                  { icon: FileSpreadsheet, t: "Corrections, not deletions", b: "Mistakes are reversed openly, never erased." },
                ].map(({ icon: Icon, t, b }) => (
                  <li key={t} className="border-sidebar-border bg-sidebar-2/80 rounded-xl border p-4">
                    <Icon className="text-sidebar-accent size-5" aria-hidden />
                    <p className="mt-3 font-semibold text-white">{t}</p>
                    <p className="text-sidebar-muted text-sm">{b}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <SectionHeading eyebrow="Questions" title="Frequently asked questions" center />
          <div className="mt-10">
            <Faq items={FAQ} />
          </div>
        </section>

        {/* Demo request */}
        <section id="demo" className="border-border bg-surface scroll-mt-16 border-t">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col gap-5">
              <p className="text-accent text-xs font-semibold tracking-widest uppercase">Get started</p>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">See {PRODUCT} working for a society like yours</h2>
              <p className="text-muted text-lg leading-relaxed">Tell us a little about your society and we&apos;ll arrange a walkthrough using an example set up the way you work.</p>
              <ul className="flex flex-col gap-3">
                {["A live walkthrough with your executives", "Set up around your sector, products and bye-laws", "Answers on migrating your existing records and pricing"].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <CheckCircle2 className="text-accent mt-0.5 size-5 shrink-0" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="border-border bg-background mt-2 flex items-center gap-3 rounded-xl border p-4 text-sm">
                <BarChart3 className="text-gold size-5 shrink-0" aria-hidden />
                <span className="text-muted">Already a customer? <Link href="/sign-in" className="text-accent font-medium hover:underline">Sign in to your society</Link></span>
              </div>
            </div>
            <div className="border-border bg-background relative rounded-2xl border p-6 shadow-md sm:p-8">
              <DemoForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <Logo />
            <p className="text-muted max-w-sm text-sm">Cooperative management software for Nigerian societies. A {COMPANY} product.</p>
          </div>
          <nav aria-label="Footer" className="text-muted flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="hover:text-foreground">
                {label}
              </a>
            ))}
            <Link href="/sign-in" className="hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
        <div className="border-border text-muted mx-auto flex max-w-7xl flex-col gap-2 border-t px-4 py-5 text-xs sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
          <p className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${health.ok ? "bg-success" : "bg-danger"}`} aria-hidden />
            {health.ok ? "All systems operational" : "Service disruption"}
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, center, children }: { eyebrow: string; title: string; center?: boolean; children?: React.ReactNode }) {
  return (
    <div className={cn("flex max-w-3xl flex-col gap-3", center && "mx-auto items-center text-center")}>
      <p className="text-accent text-xs font-semibold tracking-widest uppercase">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {children && <p className="text-muted text-lg leading-relaxed">{children}</p>}
    </div>
  );
}

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-surface overflow-hidden rounded-2xl border p-1.5 shadow-lg">
      <div className="bg-surface-2 flex items-center gap-1.5 rounded-t-xl px-3 py-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="overflow-hidden rounded-b-xl [&_img]:h-auto [&_img]:w-full">{children}</div>
    </div>
  );
}
