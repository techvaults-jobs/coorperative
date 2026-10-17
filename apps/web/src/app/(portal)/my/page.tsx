import { formatNaira, kobo } from "@techvaults/core";
import { getMember, listJournal, listLoans, loanPosition, memberBalances, schema, sql, withSociety } from "@techvaults/db";
import { ArrowUpRight, Landmark, PiggyBank, Wallet } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { db } from "@/lib/db";
import { LOAN_STATUS } from "@/lib/loan-status";
import { requirePortal } from "@/lib/session";
import { requirePortalSociety } from "@/lib/society";

export const metadata = { title: "My membership" };

const ICON = { "2": PiggyBank, "3": Landmark, "1": Wallet } as Record<string, typeof Wallet>;

export default async function MemberHomePage() {
  const me = await requirePortal();
  const society = await requirePortalSociety();
  const data = await withSociety(db(), me.society.societyId, async (tx) => {
    const member = await getMember(tx, me.actor, me.memberId);
    const loans = society.modules.includes("loans") ? await listLoans(tx, me.actor) : [];
    const positions = new Map<string, Awaited<ReturnType<typeof loanPosition>>>();
    for (const l of loans.filter((l) => l.status === "active")) {
      const [row] = await tx.select().from(schema.loans).where(sql`id = ${l.id}`);
      positions.set(l.id, await loanPosition(tx, row!));
    }
    return {
      member: member!,
      balances: await memberBalances(tx, me.memberId),
      recent: await listJournal(tx, me.actor, { memberId: me.memberId, limit: 8 }),
      loans,
      positions,
    };
  });
  const { member, balances, recent, loans, positions } = data;
  const firstName = me.user.name.split(" ")[0];
  return (
    <>
      <Card>
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={member.fullName} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-accent text-xs font-semibold tracking-wider uppercase">{society.shortName || society.name}</p>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
            <p className="text-muted text-sm">
              Member {member.memberNo}
              {member.joinedOn && ` · since ${member.joinedOn}`}
            </p>
          </div>
          <Link href="/my/statement" className={buttonClass("secondary")}>
            Download statement
          </Link>
        </CardBody>
      </Card>

      <section aria-label="My balances" className="grid gap-4 sm:grid-cols-3">
        {balances.length === 0 ? (
          <p className="text-muted text-sm">No transactions yet.</p>
        ) : (
          balances.map((b) => <StatCard key={b.code} label={b.name.replace(/^Members' /, "My ")} icon={ICON[b.code[0]!]} value={formatNaira(b.balance)} />)
        )}
      </section>

      {loans.length > 0 && (
        <Card>
          <CardHeader
            title="My loans"
            actions={
              society.modules.includes("loans") && (
                <Link href="/my/apply" className="text-accent text-sm font-medium hover:underline">
                  Apply for a loan
                </Link>
              )
            }
          />
          <ul className="divide-border mt-3 divide-y">
            {loans.map((l) => {
              const p = positions.get(l.id);
              return (
                <li key={l.id}>
                  <Link href={`/my/loans/${l.id}`} className="hover:bg-surface-2 flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {l.productName} · {formatNaira(l.amount)}
                      </span>
                      <span className="text-muted block text-xs">
                        {p?.nextDue ? `Next payment ${formatNaira(p.nextDue.amount)} due ${p.nextDue.dueDate}` : l.purpose}
                      </span>
                    </span>
                    {p && <span className="tabular-nums">{formatNaira(p.principalOutstanding)} left</span>}
                    <Badge tone={p && p.daysPastDue > 0 ? "danger" : LOAN_STATUS[l.status]!.tone} dot>
                      {p && p.daysPastDue > 0 ? "Payment overdue" : LOAN_STATUS[l.status]!.label}
                    </Badge>
                    <ArrowUpRight className="text-subtle size-4" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Recent activity" description="Approved entries on your accounts" />
        <ul className="divide-border mt-3 divide-y">
          {recent.length === 0 && <li className="text-muted px-5 py-6 text-sm">Nothing yet.</li>}
          {recent.flatMap((e) =>
            e.lines
              .filter((l) => l.memberNo === member.memberNo)
              .map((l, i) => (
                <li key={`${e.id}-${i}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{e.description}</span>
                    <span className="text-muted text-xs">
                      {e.entryDate} · {l.accountName}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {(l.side === "credit") === (l.accountCode[0] !== "1") ? "+" : "−"}
                    {formatNaira(kobo(l.amount))}
                  </span>
                </li>
              )),
          )}
        </ul>
      </Card>
    </>
  );
}
