import { formatNaira } from "@techvaults/core";
import { listLoans, portfolioSummary, type LoanStatus } from "@techvaults/db";
import { AlertTriangle, HandCoins, Hourglass, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { LinkTabs } from "@/components/ui/tabs";
import { ROW_HOVER, Table, Td, Th } from "@/components/ui/table";
import { LOAN_STATUS } from "@/lib/loan-status";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Loans" };

const TABS: { key: string; label: string; statuses: LoanStatus[] }[] = [
  { key: "pipeline", label: "Applications", statuses: ["applied"] },
  { key: "disburse", label: "To disburse", statuses: ["approved", "disbursing"] },
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "closed", label: "Repaid", statuses: ["closed"] },
  { key: "declined", label: "Declined & withdrawn", statuses: ["rejected", "withdrawn"] },
];

export default async function LoansPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "loans.prepare") && !hasPermission(ws, "loans.approve") && !hasPermission(ws, "ledger.read")) {
    return <EmptyState title="Your role doesn't include loans." />;
  }
  const { tab: tabParam } = await searchParams;
  const { loans, summary } = await inSociety(ws, async (tx) => ({ loans: await listLoans(tx, ws.actor), summary: await portfolioSummary(tx, ws.actor) }));
  const defaultTab = summary.pendingApplications ? "pipeline" : "active";
  const tab = TABS.find((t) => t.key === (tabParam ?? defaultTab)) ?? TABS[2]!;
  const shown = loans.filter((l) => tab.statuses.includes(l.status));

  return (
    <>
      <PageHeader
        title="Loans"
        description="Applications are checked against each product's approved policy. A committee member approves, and every disbursement and repayment goes through journal approval."
        actions={
          hasPermission(ws, "loans.prepare") && (
            <Link href="/loans/new" className={buttonClass("primary")}>
              <Plus className="size-4" aria-hidden />
              New application
            </Link>
          )
        }
      />
      <section aria-label="Portfolio" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding principal" icon={Wallet} value={formatNaira(summary.outstanding)} footnote={`${summary.activeCount} active loan${summary.activeCount === 1 ? "" : "s"}`} />
        <StatCard
          label="In arrears"
          icon={AlertTriangle}
          value={formatNaira(summary.arrears)}
          footnote={`${summary.inArrearsCount} loan${summary.inArrearsCount === 1 ? "" : "s"} · PAR30 ${summary.par30.toFixed(1)}%`}
        />
        <StatCard label="Awaiting decision" icon={Hourglass} value={summary.pendingApplications.toLocaleString("en-NG")} footnote="applications" />
        <StatCard label="To disburse" icon={HandCoins} value={summary.awaitingDisbursement.toLocaleString("en-NG")} footnote="approved loans" />
      </section>
      <LinkTabs
        label="Loan stage"
        current={tab.key}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/loans?tab=${t.key}`, count: loans.filter((l) => t.statuses.includes(l.status)).length }))}
      />
      {shown.length === 0 ? (
        <EmptyState icon={HandCoins} title={`No loans in "${tab.label.toLowerCase()}".`} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Loan</Th>
              <Th>Member</Th>
              <Th className="hidden md:table-cell">Product</Th>
              <Th numeric>Amount</Th>
              {tab.key === "active" && <Th numeric>Outstanding</Th>}
              {tab.key === "active" && <Th numeric className="hidden lg:table-cell">Arrears</Th>}
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => {
              const pos = summary.positions.get(l.id);
              return (
                <tr key={l.id} className={ROW_HOVER}>
                  <Td>
                    <Link href={`/loans/${l.id}`} className="text-accent font-mono text-[13px] font-medium hover:underline">
                      #{l.loanNo}
                    </Link>
                    <p className="text-muted text-xs">{l.termMonths} months</p>
                  </Td>
                  <Td>
                    <Link href={`/loans/${l.id}`} className="group flex items-center gap-3">
                      <Avatar name={l.memberName} size="sm" />
                      <span className="min-w-0">
                        <span className="group-hover:text-accent block truncate font-medium">{l.memberName}</span>
                        <span className="text-muted block text-xs">{l.memberNo}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-muted hidden md:table-cell">{l.productName}</Td>
                  <Td numeric>{formatNaira(l.amount)}</Td>
                  {tab.key === "active" && <Td numeric>{pos ? formatNaira(pos.principalOutstanding) : "—"}</Td>}
                  {tab.key === "active" && (
                    <Td numeric className="hidden lg:table-cell">
                      {pos && pos.arrears > 0n ? <span className="text-danger font-medium">{formatNaira(pos.arrears)}</span> : <span className="text-muted">—</span>}
                    </Td>
                  )}
                  <Td>
                    <Badge tone={pos && pos.daysPastDue > 0 ? "danger" : LOAN_STATUS[l.status]!.tone} dot>
                      {pos && pos.daysPastDue > 0 ? `${pos.daysPastDue} days late` : LOAN_STATUS[l.status]!.label}
                    </Badge>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
