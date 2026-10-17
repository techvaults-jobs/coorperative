import { formatNaira } from "@techvaults/core";
import { financialPosition } from "@techvaults/db";
import { ReportFrame, ReportSection } from "@/components/report-frame";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/page-header";
import { longDate, todayIso, validDate } from "@/lib/periods";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

export const metadata = { title: "Statement of financial position" };

export default async function PositionPage({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include financial reports." />;
  const asOf = validDate((await searchParams).asOf, todayIso());
  const society = await requireSociety();
  const r = await inSociety(ws, (tx) => financialPosition(tx, ws.actor, asOf));
  const line = (l: { code: string; name: string; amount: bigint }) => ({ label: `${l.code} · ${l.name}`, amount: formatNaira(l.amount as never), sub: true });
  return (
    <ReportFrame
      title="Statement of financial position"
      society={society.name}
      period={`As at ${longDate(asOf)}`}
      csvHref={`/reports/export?report=position&asOf=${asOf}`}
      filters={
        <Field label="As at" htmlFor="asOf">
          <Input id="asOf" name="asOf" type="date" defaultValue={asOf} />
        </Field>
      }
    >
      {!r.balanced && <Alert tone="danger" className="mb-4">The statement doesn&apos;t balance. Check the trial balance.</Alert>}
      <div className="grid gap-x-10 lg:grid-cols-2">
        <div>
          <ReportSection title="Assets" rows={r.assets.map(line)} total={formatNaira(r.totals.assets)} />
        </div>
        <div>
          <ReportSection title="Liabilities" rows={r.liabilities.map(line)} total={formatNaira(r.totals.liabilities)} />
          <ReportSection
            title="Members' funds and reserves"
            rows={[...r.equity.map(line), { label: "Accumulated surplus (unappropriated)", amount: formatNaira(r.surplus), sub: true }]}
            total={formatNaira(r.totals.equity)}
          />
          <ReportSection title="Total" rows={[]} total={formatNaira(r.totals.liabilitiesAndEquity)} totalLabel="Total liabilities and members' funds" />
        </div>
      </div>
      <p className="text-muted mt-2 text-xs">
        {r.balanced ? "✓ Assets equal liabilities plus members' funds." : "Assets don't equal liabilities plus members' funds."} Unaudited management accounts.
      </p>
    </ReportFrame>
  );
}
