import { formatNaira, kobo } from "@techvaults/core";
import { interestRunForPeriod } from "@techvaults/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Table, Td, Th } from "@/components/ui/table";
import { INTEREST_MONTH_STATUS as MONTH_STATUS, monthName } from "@/lib/interest-status";
import { bpsToPercent } from "@/lib/policy-form";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { ChargeInterestForm } from "../charge-form";

export const metadata = { title: "Interest register" };

export default async function InterestMonthPage({ params, searchParams }: { params: Promise<{ period: string }>; searchParams: Promise<{ done?: string }> }) {
  const ws = await requireWorkspace();
  const { period } = await params;
  const { done } = await searchParams;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) notFound();
  const view = await inSociety(ws, (tx) => interestRunForPeriod(tx, ws.actor, period));
  const status = view.run ? view.run.status : view.blockers.length ? "open" : "due";
  const unpaid = view.rows.reduce((s, r) => s + r.unpaid, 0n);
  const canCharge = hasPermission(ws, "ledger.prepare");

  return (
    <>
      <PageHeader
        back={{ href: "/loans/interest", label: "Monthly interest" }}
        title={`Interest register · ${monthName(period)}`}
        description={`Each flexible loan's balance at the end of ${view.chargeDate}, and its monthly rate on that balance, rounded to the kobo.`}
        actions={
          <Badge tone={MONTH_STATUS[status]!.tone} dot>
            {view.run ? MONTH_STATUS[status]!.label : view.blockers.length ? "Not ready" : "To charge"}
          </Badge>
        }
      />
      {done === "submitted" && <Alert tone="success">Interest submitted. It&apos;s charged to members&apos; loans when another officer approves it in Approvals.</Alert>}
      {!view.run && view.blockers.map((b) => <Alert key={b} tone="warning">{b}</Alert>)}

      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-3">
        <StatCard label={view.run ? "Interest charged" : "Interest to charge"} value={formatNaira(view.total)} footnote={`${view.rows.length} loan${view.rows.length === 1 ? "" : "s"}`} />
        <StatCard label="Balances charged on" value={formatNaira(kobo(view.rows.reduce((s, r) => s + r.balance, 0n)))} footnote={`at ${view.chargeDate}`} />
        <StatCard label="Unpaid interest now" value={formatNaira(kobo(unpaid))} footnote="Across these loans, shown on the next collection sheet" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Register" description="The same list as the workbook's INTREST ACCOUNT sheet." />
          <CardBody className="pt-4">
            {view.rows.length === 0 ? (
              <EmptyState title="No flexible loan had a balance at the end of this month." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Card no</Th>
                    <Th>Member</Th>
                    <Th>Loan</Th>
                    <Th numeric>Balance</Th>
                    <Th numeric className="hidden sm:table-cell">
                      Rate
                    </Th>
                    <Th numeric>Interest</Th>
                    <Th numeric className="hidden md:table-cell">
                      Unpaid now
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.loanId}>
                      <Td className="tabular-nums">{r.memberNo}</Td>
                      <Td>{r.memberName}</Td>
                      <Td>
                        <Link href={`/loans/${r.loanId}`} className="hover:text-accent">
                          #{r.loanNo}
                        </Link>
                      </Td>
                      <Td numeric>{formatNaira(r.balance)}</Td>
                      <Td numeric className="hidden sm:table-cell">
                        {bpsToPercent(r.annualRateBps / 12)}
                      </Td>
                      <Td numeric className="font-medium">
                        {formatNaira(r.charge)}
                      </Td>
                      <Td numeric className="hidden md:table-cell">
                        {r.unpaid > 0n ? formatNaira(r.unpaid) : <span className="text-muted">—</span>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <Td colSpan={3}>Total</Td>
                    <Td numeric>{formatNaira(kobo(view.rows.reduce((s, r) => s + r.balance, 0n)))}</Td>
                    <Td className="hidden sm:table-cell" />
                    <Td numeric>{formatNaira(view.total)}</Td>
                    <Td numeric className="hidden md:table-cell">
                      {formatNaira(kobo(unpaid))}
                    </Td>
                  </tr>
                </tfoot>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={view.run ? "Posting" : "Charge this month"} />
          <CardBody className="flex flex-col gap-3 text-sm">
            {view.run ? (
              <>
                <p>
                  Submitted by {view.run.createdByName} on {view.run.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" })}.
                </p>
                <p className="text-muted">
                  {view.run.status === "posted"
                    ? "Posted: Dr Interest receivable, Cr Interest income. Members pay it at meetings."
                    : "Waiting for another officer to approve it in Approvals. If it's turned down, the month can be charged again."}
                </p>
                {view.run.status === "submitted" && (
                  <Link href="/approvals" className="text-accent font-medium">
                    Go to Approvals
                  </Link>
                )}
              </>
            ) : canCharge ? (
              <>
                <p className="text-muted">One journal entry dated {view.chargeDate}: Dr Interest receivable for each loan, Cr Interest income. Another officer approves it.</p>
                <ChargeInterestForm period={period} idempotencyKey={randomUUID()} total={formatNaira(view.total)} disabled={view.blockers.length > 0 || view.rows.length === 0} />
              </>
            ) : (
              <p className="text-muted">The treasurer charges the month&apos;s interest.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
