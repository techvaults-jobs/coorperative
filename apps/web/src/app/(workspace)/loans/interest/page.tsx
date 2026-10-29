import { formatNaira } from "@techvaults/core";
import { interestMonths } from "@techvaults/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { ROW_HOVER, Table, Td, Th } from "@/components/ui/table";
import { INTEREST_MONTH_STATUS as MONTH_STATUS, monthName } from "@/lib/interest-status";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Monthly interest" };

export default async function InterestPage() {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read") && !hasPermission(ws, "loans.prepare") && !hasPermission(ws, "loans.approve")) {
    return <EmptyState title="Your role doesn't include loan interest." />;
  }
  const { hasFlexibleLoans, months } = await inSociety(ws, (tx) => interestMonths(tx, ws.actor));
  return (
    <>
      <PageHeader
        back={{ href: "/loans", label: "Loans" }}
        title="Monthly interest"
        description="Flexible weekly loans are charged their monthly rate on the balance still owed at each month end. The treasurer reviews the month's register and another officer approves it. Members then pay it at meetings in the Interest column."
      />
      {months.length === 0 ? (
        <EmptyState title={hasFlexibleLoans ? "No months to charge yet." : "No flexible weekly loans yet."}>
          {hasFlexibleLoans ? "The first month appears once a loan is paid out." : "Set up a loan product with the flexible weekly method in Products, then disburse loans on it."}
        </EmptyState>
      ) : (
        <Card>
          <CardBody className="pt-4">
            <Table>
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th>Charged on</Th>
                  <Th numeric>Loans</Th>
                  <Th numeric>Interest</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.period} className={ROW_HOVER}>
                    <Td className="font-medium whitespace-nowrap">{monthName(m.period)}</Td>
                    <Td className="whitespace-nowrap">{m.chargeDate}</Td>
                    <Td numeric>{m.total === null ? "—" : m.loans}</Td>
                    <Td numeric>{m.total === null ? "—" : formatNaira(m.total)}</Td>
                    <Td>
                      <Badge tone={MONTH_STATUS[m.status]!.tone}>{MONTH_STATUS[m.status]!.label}</Badge>
                    </Td>
                    <Td className="text-right">
                      {m.status !== "open" && (
                        <Link href={`/loans/interest/${m.period}`} className={buttonClass(m.status === "due" ? "primary" : "secondary", undefined, "sm")}>
                          {m.status === "due" ? "Review" : "View"}
                        </Link>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      )}
    </>
  );
}
