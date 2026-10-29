import { formatNaira, isFlexible, nextMeetingDate, type Kobo } from "@techvaults/core";
import { getLoan, listAccounts, loanInterestCharges, meetingWeekday } from "@techvaults/db";
import { CalendarClock, CheckCircle2, Circle, HandCoins, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Table, Td, Th } from "@/components/ui/table";
import { WeeklyLoanCards } from "@/components/loans/weekly-loan";
import { LOAN_STATUS } from "@/lib/loan-status";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { PolicyGrid } from "../../products/policy-summary";
import { DecisionPanel, DisbursePanel, RepayPanel } from "./loan-actions";

export const metadata = { title: "Loan" };

const DONE: Record<string, string> = {
  applied: "Application recorded. A committee member will decide it.",
  approve: "Approved. The treasurer can now prepare the disbursement.",
  reject: "Declined. The reason is recorded on the loan.",
  withdraw: "Withdrawn.",
  disbursing: "Disbursement prepared. The loan goes live when another officer approves it in Approvals.",
  repayment: "Repayment prepared. It's applied to the loan when another officer approves it in Approvals.",
};

const when = (d: Date) => d.toLocaleDateString("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" });

export default async function LoanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const ws = await requireWorkspace();
  const { id } = await params;
  const { done } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canLedger = hasPermission(ws, "ledger.prepare");
  const data = await inSociety(ws, async (tx) => {
    const loan = await getLoan(tx, ws.actor, id);
    if (!loan) return null;
    const banks = canLedger ? (await listAccounts(tx, ws.actor)).filter((a) => a.class === "asset" && !a.isMemberControl && a.isActive) : [];
    const flexible = isFlexible(loan.policy.interestMethod);
    return { loan, banks, flexible, charges: flexible ? await loanInterestCharges(tx, ws.actor, id) : [], weekday: flexible ? await meetingWeekday(tx, ws.actor) : null };
  });
  if (!data) notFound();
  const { loan, banks, flexible, charges, weekday } = data;
  const pos = loan.position;
  const status = LOAN_STATUS[loan.status]!;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  let remaining = (pos.principalRepaid + pos.interestPaid) as bigint;
  const rows = (pos.schedule?.instalments ?? []).map((i) => {
    const cover = remaining >= i.payment ? i.payment : remaining;
    remaining -= cover;
    const state = cover === i.payment ? "paid" : i.dueDate <= today ? "overdue" : cover > 0n ? "part" : "due";
    return { ...i, state, covered: cover as Kobo };
  });
  const timeline = [
    { label: "Applied", detail: `${when(loan.appliedAt)} · recorded by ${loan.appliedByName}`, done: true },
    {
      label: loan.status === "rejected" ? "Declined" : loan.status === "withdrawn" ? "Withdrawn" : "Committee decision",
      detail: loan.decidedAt ? `${when(loan.decidedAt)} · ${loan.decidedByName}${loan.decisionReason ? ` · “${loan.decisionReason}”` : ""}` : "Waiting for a committee member",
      done: !!loan.decidedAt,
    },
    ...(["rejected", "withdrawn"].includes(loan.status)
      ? []
      : [
          {
            label: "Disbursed",
            detail: loan.disbursedOn ? `${loan.disbursedOn}${loan.status === "disbursing" ? " · waiting for journal approval" : ""}` : "Not yet",
            done: ["active", "closed"].includes(loan.status),
          },
          { label: "Repaid in full", detail: loan.status === "closed" ? "Closed" : `${formatNaira(pos.principalOutstanding)} outstanding`, done: loan.status === "closed" },
        ]),
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/loans", label: "Loans" }}
        title={`Loan #${loan.loanNo}`}
        description={`${loan.productName} · ${loan.termMonths} months · ${loan.purpose}`}
        actions={
          <Badge tone={pos.daysPastDue > 0 && loan.status === "active" ? "danger" : status.tone} dot>
            {pos.daysPastDue > 0 && loan.status === "active" ? `${pos.daysPastDue} days late` : status.label}
          </Badge>
        }
      />
      {done && DONE[done] && <Alert tone="success">{DONE[done]}</Alert>}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <Avatar name={loan.memberName} size="lg" />
          <div className="min-w-0 flex-1">
            <Link href={`/members/${loan.memberId}`} className="hover:text-accent font-semibold">
              {loan.memberName}
            </Link>
            <p className="text-muted text-sm">{loan.memberNo}</p>
          </div>
          {loan.guarantors.length > 0 && (
            <div className="text-sm">
              <p className="text-muted text-xs">Guarantors</p>
              <p>{loan.guarantors.map((g) => `${g.fullName} (${g.memberNo})`).join(", ")}</p>
            </div>
          )}
        </CardBody>
      </Card>

      <section aria-label="Loan figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Amount" icon={HandCoins} value={formatNaira(loan.amount)} footnote={`Policy v${loan.policyVersion}`} />
        <StatCard label="Principal outstanding" icon={Wallet} value={formatNaira(pos.principalOutstanding)} footnote={`${formatNaira(pos.principalRepaid)} repaid`} />
        <StatCard label="Arrears" icon={TriangleAlert} value={formatNaira(pos.arrears)} footnote={pos.daysPastDue ? `oldest ${pos.daysPastDue} days overdue` : "Up to date"} />
        <StatCard
          label="Next payment"
          icon={CalendarClock}
          value={pos.nextDue ? formatNaira(pos.nextDue.amount) : "—"}
          footnote={pos.nextDue ? `due ${pos.nextDue.dueDate}` : loan.status === "closed" ? "Fully repaid" : "Starts after disbursement"}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {flexible ? (
            <WeeklyLoanCards position={pos} charges={charges} termMonths={loan.termMonths} annualRateBps={loan.policy.annualRateBps} audience="officer" />
          ) : (
          <Card>
            <CardHeader title="Repayment schedule" description={pos.schedule ? `Interest ${formatNaira(pos.schedule.totalInterest)} · total ${formatNaira(pos.schedule.totalRepayable)}` : undefined} />
            <CardBody className="pt-4">
              {rows.length === 0 ? (
                <EmptyState title="The schedule starts when the loan is disbursed." />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>Due</Th>
                      <Th numeric>Payment</Th>
                      <Th numeric className="hidden sm:table-cell">Principal</Th>
                      <Th numeric className="hidden sm:table-cell">Interest</Th>
                      <Th numeric className="hidden md:table-cell">Balance</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.number}>
                        <Td>{r.number}</Td>
                        <Td className="whitespace-nowrap">{r.dueDate}</Td>
                        <Td numeric>{formatNaira(r.payment)}</Td>
                        <Td numeric className="hidden sm:table-cell">
                          {formatNaira(r.principal)}
                        </Td>
                        <Td numeric className="hidden sm:table-cell">
                          {formatNaira(r.interest)}
                        </Td>
                        <Td numeric className="hidden md:table-cell">
                          {formatNaira(r.balance)}
                        </Td>
                        <Td>
                          {r.state === "paid" && <Badge tone="good">Paid</Badge>}
                          {r.state === "overdue" && <Badge tone="danger">Overdue</Badge>}
                          {r.state === "part" && <Badge tone="warning">Part paid</Badge>}
                          {r.state === "due" && <Badge>Upcoming</Badge>}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
          )}
          <Card>
            <CardHeader title="Terms granted" description="The product policy this loan was approved under. Later policy changes don't affect it." />
            <CardBody>
              <PolicyGrid kind="loan" policy={loan.policy} />
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {loan.status === "applied" && (
            <DecisionPanel
              loanId={loan.id}
              canDecide={hasPermission(ws, "loans.approve") && loan.appliedBy !== ws.user.id}
              canWithdraw={hasPermission(ws, "loans.prepare")}
              mine={loan.appliedBy === ws.user.id}
            />
          )}
          {loan.status === "approved" && canLedger && (
            <DisbursePanel
              loanId={loan.id}
              idempotencyKey={randomUUID()}
              banks={banks.map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }))}
              today={today}
              fee={formatNaira(((loan.amount * BigInt(loan.policy.processingFeeBps) + 5_000n) / 10_000n) as Kobo)}
              {...(flexible && weekday !== null ? { firstDue: nextMeetingDate(weekday, tomorrow) } : {})}
            />
          )}
          {loan.status === "active" && canLedger && (
            <RepayPanel
              loanId={loan.id}
              idempotencyKey={randomUUID()}
              banks={banks.map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }))}
              today={today}
              suggested={pos.arrears > 0n ? (Number(pos.arrears) / 100).toFixed(2) : pos.nextDue ? (Number(pos.nextDue.amount) / 100).toFixed(2) : ""}
            />
          )}
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <ol className="flex flex-col gap-4">
                {timeline.map((t) => (
                  <li key={t.label} className="flex gap-3">
                    {t.done ? <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden /> : <Circle className="text-subtle mt-0.5 size-4 shrink-0" aria-hidden />}
                    <div>
                      <p className={cn("text-sm font-medium", !t.done && "text-muted")}>{t.label}</p>
                      <p className="text-muted text-xs">{t.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
