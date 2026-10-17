import { add, formatNaira, parseNaira } from "@techvaults/core";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

const FOUNDATION = [
  {
    title: "Money handled in kobo",
    body: "Amounts are whole kobo with a recorded rounding rule. ₦0.10 + ₦0.20 is exactly ₦0.30.",
  },
  {
    title: "Double-entry ledger",
    body: "Every entry must balance. The database rejects an unbalanced entry when it is saved.",
  },
  {
    title: "Corrections by reversal",
    body: "Posted entries and audit records can't be edited or deleted. Mistakes are fixed with a linked reversal.",
  },
  {
    title: "Society isolation",
    body: "Row-level security limits every query to one society. Staff support access is time-limited and logged.",
  },
  {
    title: "Tamper-evident audit trail",
    body: "Each change is hash-chained to the one before it, so an edit to history is detectable.",
  },
  {
    title: "Separation of duties",
    body: "The person who prepares a transaction can't approve it. Auditors get read-only access.",
  },
];

const NEXT = ["Monthly payroll deduction schedules and reconciliation", "Approval workflows (maker-checker) for entries", "Member self-service statements", "Data import for existing societies"];

export default async function Home() {
  const health = await checkHealth();
  const sample = formatNaira(add(parseNaira("0.10"), parseNaira("0.20")));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-4">
        <p className="text-muted font-mono text-xs uppercase tracking-widest">TechVaults · Cooperative Management Platform</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Records that cooperative members and auditors can trust.
        </h1>
        <p className="text-muted max-w-2xl text-lg">
          One platform for Nigerian cooperative societies, configured to each society&apos;s approved rules. This preview
          shows the foundation: the ledger, isolation and audit controls that every later feature builds on.
        </p>
        <div>
          <Link href="/sign-in" className={buttonClass("primary")}>
            Sign in
          </Link>
        </div>
      </header>

      <section aria-labelledby="status" className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="status" className="text-sm font-semibold">
            System status
          </h2>
          <p className="text-muted text-sm">
            Checked <time dateTime={health.checkedAt}>{new Date(health.checkedAt).toUTCString()}</time>
          </p>
        </div>
        <dl className="tabular flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted">Database</dt>
            <dd>
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${health.ok ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"}`}
              >
                {health.ok ? "Connected" : "Unavailable"}
              </span>
            </dd>
          </div>
          {health.ok && (
            <>
              <div>
                <dt className="text-muted">Tables with society isolation</dt>
                <dd className="font-mono">{health.guardedTables}</dd>
              </div>
              <div>
                <dt className="text-muted">Append-only guards</dt>
                <dd className="font-mono">{health.appendOnlyTriggers}</dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-muted">₦0.10 + ₦0.20</dt>
            <dd className="font-mono">{sample}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="foundation" className="flex flex-col gap-5">
        <h2 id="foundation" className="text-xl font-semibold">
          What the foundation guarantees
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FOUNDATION.map((item) => (
            <li key={item.title} className="border-border flex flex-col gap-1 border-t pt-4">
              <h3 className="font-medium">{item.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="next" className="flex flex-col gap-3">
        <h2 id="next" className="text-xl font-semibold">
          Coming next
        </h2>
        <ol className="text-muted flex list-decimal flex-col gap-1 pl-5 text-sm">
          {NEXT.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ol>
        <p className="text-muted max-w-2xl text-sm">
          Loan rules, exit settlement and dividends will be added once discovery research and our legal and accounting advisers
          have confirmed each society&apos;s rules.
        </p>
      </section>
    </main>
  );
}
