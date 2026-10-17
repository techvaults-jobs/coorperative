import { formatNaira, type Kobo } from "@techvaults/core";
import { listJournal, memberCounts, monthlyFlows, trialBalance } from "@techvaults/db";
import { ArrowUpRight, BookOpen, ClipboardCheck, Landmark, PiggyBank, UserPlus, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Composition } from "@/components/charts/composition";
import { TrendChart } from "@/components/charts/trend-chart";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { listSubmissions } from "@techvaults/db";

export const metadata = { title: "Overview" };

const naira = (k: bigint) => Number(k) / 100;
const MONTH = new Intl.DateTimeFormat("en-NG", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-NG", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function OverviewPage() {
  const ws = await requireWorkspace();
  const canLedger = hasPermission(ws, "ledger.read");
  const canMembers = hasPermission(ws, "members.read");
  const canApprove = hasPermission(ws, "ledger.approve");
  const data = await inSociety(ws, async (tx) => ({
    counts: canMembers ? await memberCounts(tx, ws.actor) : null,
    tb: canLedger ? await trialBalance(tx) : [],
    recent: canLedger ? await listJournal(tx, ws.actor, { limit: 6 }) : [],
    flows: canLedger ? await monthlyFlows(tx, ws.actor, { months: 12 }) : [],
    pending: canApprove ? (await listSubmissions(tx, ws.actor, { status: "pending" })).filter((s) => s.preparedBy !== ws.user.id) : [],
  }));

  const sum = (pred: (r: (typeof data.tb)[number]) => boolean) => data.tb.filter(pred).reduce((s, r) => s + r.balance, 0n) as Kobo;
  const savings = sum((r) => r.class === "liability" && r.code.startsWith("21"));
  const shares = sum((r) => r.class === "equity" && r.code.startsWith("31"));
  const loans = sum((r) => r.class === "asset" && r.code.startsWith("13"));
  const income = sum((r) => r.class === "income");
  const expense = sum((r) => r.class === "expense");
  const reserves = (sum((r) => r.class === "equity" && !r.code.startsWith("31")) + income - expense) as Kobo;
  const thisMonth = data.flows.at(-1);
  const lastMonth = data.flows.at(-2);
  const contributionTrend = data.flows.map((f) => naira(f.contributions));
  const firstName = ws.user.name.split(" ")[0];

  const delta = (now?: bigint, before?: bigint) => {
    if (now === undefined || before === undefined || before === 0n) return undefined;
    const pct = (Number(now - before) / Number(before)) * 100;
    return { text: `${Math.abs(pct).toFixed(0)}% vs last month`, direction: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat", good: pct >= 0 } as const;
  };

  return (
    <>
      <PageHeader
        eyebrow={ws.society.societyName}
        title={`${greeting()}, ${firstName}`}
        description="Here's where the society stands today. Every figure comes straight from approved journal entries."
        actions={
          <>
            {hasPermission(ws, "members.write") && (
              <Link href="/members/new" className={buttonClass("secondary")}>
                <UserPlus className="size-4" aria-hidden />
                Add member
              </Link>
            )}
            {hasPermission(ws, "ledger.prepare") && (
              <Link href="/ledger/new" className={buttonClass("primary")}>
                <BookOpen className="size-4" aria-hidden />
                Prepare entry
              </Link>
            )}
          </>
        }
      />

      {data.pending.length > 0 && (
        <Alert
          tone="warning"
          title={`${data.pending.length === 1 ? "1 entry is" : `${data.pending.length} entries are`} waiting for your approval`}
          actions={
            <Link href="/approvals" className="inline-flex items-center gap-1 text-sm font-semibold underline-offset-2 hover:underline">
              Review now <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          }
        >
          Nothing is posted to the ledger until a second officer approves it.
        </Alert>
      )}

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active members"
          icon={Users}
          value={data.counts ? (data.counts.byStatus.active ?? 0).toLocaleString("en-NG") : "—"}
          footnote={data.counts ? `${data.counts.total.toLocaleString("en-NG")} on the register` : undefined}
        />
        <StatCard label="Members' savings" icon={PiggyBank} value={canLedger ? formatNaira(savings) : "—"} trend={canLedger ? contributionTrend : undefined} />
        <StatCard label="Share capital" icon={Landmark} value={canLedger ? formatNaira(shares) : "—"} />
        <StatCard label="Loans outstanding" icon={Wallet} value={canLedger ? formatNaira(loans) : "—"} />
      </section>

      {canLedger && (
        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              title="Monthly contributions"
              description="Savings and share contributions credited to members, last 12 months"
              actions={
                thisMonth && (
                  <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums">{formatNaira(thisMonth.contributions)}</p>
                    <p className="text-muted text-xs">
                      this month
                      {delta(thisMonth.contributions, lastMonth?.contributions) && (
                        <>
                          {" · "}
                          {delta(thisMonth.contributions, lastMonth?.contributions)!.direction === "down" ? "▼" : "▲"}{" "}
                          {delta(thisMonth.contributions, lastMonth?.contributions)!.text}
                        </>
                      )}
                    </p>
                  </div>
                )
              }
            />
            <CardBody className="pt-4">
              <TrendChart
                kind="bars"
                ariaLabel="Monthly contributions over the last 12 months"
                data={data.flows.map((f) => {
                  const d = new Date(`${f.month}T00:00:00Z`);
                  return { label: MONTH.format(d), title: MONTH_LONG.format(d), value: naira(f.contributions) };
                })}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Member funds" description="How members' money is held" />
            <CardBody>
              <Composition
                ariaLabel="Member funds by type"
                parts={[
                  { label: "Ordinary savings", value: naira(savings) },
                  { label: "Share capital", value: naira(shares) },
                  { label: "Reserves and surplus", value: naira(reserves) },
                ]}
              />
              <div className="border-border mt-5 flex items-center justify-between border-t pt-4 text-sm">
                <span className="text-muted">Loans outstanding</span>
                <span className="font-medium tabular-nums">{formatNaira(loans)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted">Surplus this year</span>
                <span className="font-medium tabular-nums">{formatNaira((income - expense) as Kobo)}</span>
              </div>
            </CardBody>
          </Card>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-3">
        {canLedger && (
          <Card className="xl:col-span-2">
            <CardHeader
              title="Recent activity"
              description="The latest approved journal entries"
              actions={
                <Link href="/ledger" className="text-accent text-sm font-medium hover:underline">
                  Open journal
                </Link>
              }
            />
            <ul className="divide-border mt-3 divide-y">
              {data.recent.length === 0 && <li className="text-muted px-5 py-8 text-center text-sm">No entries posted yet.</li>}
              {data.recent.map((e) => {
                const total = e.lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0n) as Kobo;
                return (
                  <li key={e.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="bg-surface-2 text-muted flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-[11px]">#{e.entryNo.toString()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.description}</p>
                      <p className="text-muted text-xs">
                        {e.entryDate} · {e.preparedByName}
                      </p>
                    </div>
                    {e.reversesEntryId && <Badge tone="warning">Reversal</Badge>}
                    <span className="text-sm font-medium tabular-nums">{formatNaira(total)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <div className="flex flex-col gap-4">
          {data.counts && (
            <Card>
              <CardHeader title="Membership" description={`${data.counts.total.toLocaleString("en-NG")} people on the register`} />
              <CardBody className="flex flex-col gap-2.5">
                {(
                  [
                    ["active", "Active", "good"],
                    ["applicant", "Applicants", "info"],
                    ["suspended", "Suspended", "warning"],
                    ["exiting", "Exiting", "warning"],
                    ["exited", "Exited", "neutral"],
                    ["deceased", "Deceased", "neutral"],
                  ] as const
                )
                  .filter(([k]) => (data.counts!.byStatus[k] ?? 0) > 0 || k === "active")
                  .map(([k, label, tone]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <Badge tone={tone} dot>
                        {label}
                      </Badge>
                      <span className="font-mono tabular-nums">{(data.counts!.byStatus[k] ?? 0).toLocaleString("en-NG")}</span>
                    </div>
                  ))}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="grid gap-2">
              {[
                { href: "/members", label: "Find a member", icon: Users, show: canMembers },
                { href: "/approvals", label: "Review approvals", icon: ClipboardCheck, show: canApprove || hasPermission(ws, "ledger.prepare") },
                { href: "/trial-balance", label: "Trial balance", icon: BookOpen, show: canLedger },
              ]
                .filter((a) => a.show)
                .map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className="border-border hover:border-accent/40 hover:bg-accent-soft group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors">
                    <Icon className="text-muted group-hover:text-accent size-4" aria-hidden />
                    {label}
                    <ArrowUpRight className="text-subtle ml-auto size-3.5" aria-hidden />
                  </Link>
                ))}
            </CardBody>
          </Card>
        </div>
      </section>
    </>
  );
}
