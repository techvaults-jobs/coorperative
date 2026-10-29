import { formatNaira, isFlexible } from "@techvaults/core";
import { getLoan, loanInterestCharges, withSociety } from "@techvaults/db";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Table, Td, Th } from "@/components/ui/table";
import { WeeklyLoanCards } from "@/components/loans/weekly-loan";
import { db } from "@/lib/db";
import { LOAN_STATUS } from "@/lib/loan-status";
import { requirePortal } from "@/lib/session";

export const metadata = { title: "My loan" };

export default async function MyLoanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ applied?: string }> }) {
  const me = await requirePortal();
  const { id } = await params;
  const { applied } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // listLoans limits a member to their own loans, so someone else's loan is simply not found.
  const data = await withSociety(db(), me.society.societyId, async (tx) => {
    const loan = await getLoan(tx, me.actor, id);
    // Charges are read only once getLoan has confirmed the loan is the member's own.
    return loan ? { loan, charges: isFlexible(loan.policy.interestMethod) ? await loanInterestCharges(tx, me.actor, id) : [] } : null;
  });
  if (!data) notFound();
  const { loan, charges } = data;
  const flexible = isFlexible(loan.policy.interestMethod);
  const pos = loan.position;
  let paid = pos.principalRepaid + pos.interestPaid;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        back={{ href: "/my", label: "Home" }}
        title={`${loan.productName} · ${formatNaira(loan.amount)}`}
        description={`${loan.termMonths} months · ${loan.purpose}`}
        actions={
          <Badge tone={LOAN_STATUS[loan.status]!.tone} dot>
            {LOAN_STATUS[loan.status]!.label}
          </Badge>
        }
      />
      {applied && <Alert tone="success">Application sent. The loan committee will review it; you&apos;ll see the decision here.</Alert>}
      {loan.status === "rejected" && loan.decisionReason && <Alert tone="info">The committee declined this application: {loan.decisionReason}</Alert>}
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Still owed" value={formatNaira(pos.principalOutstanding)} footnote={`${formatNaira(pos.principalRepaid)} repaid`} />
        <StatCard label="Overdue" value={formatNaira(pos.arrears)} footnote={pos.daysPastDue ? `${pos.daysPastDue} days` : "Nothing overdue"} />
        <StatCard label="Next payment" value={pos.nextDue ? formatNaira(pos.nextDue.amount) : "—"} footnote={pos.nextDue ? `due ${pos.nextDue.dueDate}` : undefined} />
      </section>
      {flexible ? (
        <WeeklyLoanCards position={pos} charges={charges} termMonths={loan.termMonths} annualRateBps={loan.policy.annualRateBps} audience="member" />
      ) : (
      <Card>
        <CardHeader title="Repayment schedule" />
        <CardBody className="pt-4">
          {!pos.schedule ? (
            <p className="text-muted text-sm">Your schedule appears once the loan is paid out.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Due</Th>
                  <Th numeric>Payment</Th>
                  <Th numeric className="hidden sm:table-cell">
                    Balance after
                  </Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {pos.schedule.instalments.map((i) => {
                  const cover = paid >= i.payment ? i.payment : paid;
                  paid -= cover;
                  const state = cover === i.payment ? "Paid" : i.dueDate <= today ? "Overdue" : cover > 0n ? "Part paid" : "Upcoming";
                  return (
                    <tr key={i.number}>
                      <Td>{i.number}</Td>
                      <Td>{i.dueDate}</Td>
                      <Td numeric>{formatNaira(i.payment)}</Td>
                      <Td numeric className="hidden sm:table-cell">
                        {formatNaira(i.balance)}
                      </Td>
                      <Td>
                        <Badge tone={state === "Paid" ? "good" : state === "Overdue" ? "danger" : state === "Part paid" ? "warning" : "neutral"}>{state}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
      )}
    </>
  );
}
