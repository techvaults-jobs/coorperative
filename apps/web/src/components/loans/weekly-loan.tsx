import { formatNaira, termWeeks } from "@techvaults/core";
import type { LoanInterestCharge, LoanPosition } from "@techvaults/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { bpsToPercent } from "@/lib/policy-form";

const RUN_STATUS: Record<LoanInterestCharge["status"], { label: string; tone: "good" | "warning" | "neutral" }> = {
  posted: { label: "Charged", tone: "good" },
  submitted: { label: "Waiting for approval", tone: "warning" },
  abandoned: { label: "Turned down", tone: "neutral" },
};

/**
 * A flexible weekly loan (D-028): progress against the expected weekly repayment, and the
 * interest charged each month with what's been paid of it. Used by officers and members.
 */
export function WeeklyLoanCards({
  position,
  charges,
  termMonths,
  annualRateBps,
  audience,
}: {
  position: LoanPosition;
  charges: LoanInterestCharge[];
  termMonths: number;
  annualRateBps: number;
  audience: "officer" | "member";
}) {
  const w = position.weekly;
  const you = audience === "member";
  return (
    <>
      <Card>
        <CardHeader
          title="Weekly repayments"
          description={`Any amount can be paid at each meeting. ${you ? "You're" : "The member is"} expected to repay about ${w ? formatNaira(w.weekly) : "the same amount"} a week over ${termWeeks(termMonths)} weeks.`}
        />
        <CardBody>
          {!w ? (
            <EmptyState title="Repayments start once the loan is paid out." />
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              {[
                ["Expected each week", formatNaira(w.weekly)],
                ["Expected by now", formatNaira(w.expected)],
                ["Repaid", formatNaira(position.principalRepaid)],
                [
                  "Behind",
                  w.behind > 0n ? `${formatNaira(w.behind)} · ${w.weeksBehind === 0 ? "under a week" : `${w.weeksBehind} week${w.weeksBehind === 1 ? "" : "s"}`}` : "Up to date",
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted text-xs">{k}</dt>
                  <dd className="font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Interest"
          description={`${bpsToPercent(annualRateBps / 12)} a month on the balance still owed at each month end. Interest paid at meetings clears the oldest charge first; anything unpaid carries forward.`}
        />
        <CardBody className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-4 text-sm">
            {[
              ["Charged", formatNaira(position.interestCharged)],
              ["Paid", formatNaira(position.interestPaid)],
              ["Unpaid", formatNaira(position.interestDue)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted text-xs">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {charges.length === 0 ? (
            <p className="text-muted text-sm">No interest has been charged yet. The first charge is made at the end of the month.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th numeric>Balance at month end</Th>
                  <Th numeric>Interest</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.period}>
                    <Td className="whitespace-nowrap">{new Date(`${c.period}-01T00:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" })}</Td>
                    <Td numeric>{formatNaira(c.balance)}</Td>
                    <Td numeric>{formatNaira(c.amount)}</Td>
                    <Td>
                      <Badge tone={RUN_STATUS[c.status].tone}>{RUN_STATUS[c.status].label}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
