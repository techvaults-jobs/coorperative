import { formatNaira } from "@techvaults/core";
import { incomeStatement } from "@techvaults/db";
import { ReportFrame, ReportSection } from "@/components/report-frame";
import { Field, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/page-header";
import { financialYearStart, longDate, todayIso, validDate } from "@/lib/periods";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

export const metadata = { title: "Income and expenditure" };

export default async function IncomePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include financial reports." />;
  const society = await requireSociety();
  const params = await searchParams;
  const to = validDate(params.to, todayIso());
  const from = validDate(params.from, financialYearStart(to, society.financialYearStart));
  const r = await inSociety(ws, (tx) => incomeStatement(tx, ws.actor, from, to));
  const line = (l: { code: string; name: string; amount: bigint }) => ({ label: `${l.code} · ${l.name}`, amount: formatNaira(l.amount as never), sub: true });
  const deficit = r.totals.surplus < 0n;
  return (
    <ReportFrame
      title="Income and expenditure"
      society={society.name}
      period={`${longDate(from)} to ${longDate(to)}`}
      csvHref={`/reports/export?report=income&from=${from}&to=${to}`}
      filters={
        <>
          <Field label="From" htmlFor="from">
            <Input id="from" name="from" type="date" defaultValue={from} />
          </Field>
          <Field label="To" htmlFor="to">
            <Input id="to" name="to" type="date" defaultValue={to} />
          </Field>
        </>
      }
    >
      <div className="max-w-2xl">
        <ReportSection title="Income" rows={r.income.map(line)} total={formatNaira(r.totals.income)} />
        <ReportSection title="Expenditure" rows={r.expenses.map(line)} total={formatNaira(r.totals.expenses)} />
        <ReportSection
          title={deficit ? "Deficit" : "Surplus"}
          rows={
            deficit
              ? []
              : [
                  { label: "Statutory reserve, 25% of surplus (Act s.34)", amount: formatNaira(r.statutoryReserve), sub: true },
                  { label: "Available for appropriation at the AGM", amount: formatNaira((r.totals.surplus - r.statutoryReserve) as never), sub: true },
                ]
          }
          total={formatNaira(r.totals.surplus)}
          totalLabel={deficit ? "Deficit for the period" : "Surplus for the period"}
        />
        <p className="text-muted text-xs">
          The reserve line shows the minimum transfer the Act requires; the transfer itself is posted when the AGM approves the accounts. Unaudited management accounts.
        </p>
      </div>
    </ReportFrame>
  );
}
