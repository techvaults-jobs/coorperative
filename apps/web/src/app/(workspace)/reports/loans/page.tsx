import { formatNaira } from "@techvaults/core";
import { loanAging } from "@techvaults/db";
import Link from "next/link";
import { ReportFrame } from "@/components/report-frame";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/page-header";
import { longDate, todayIso, validDate } from "@/lib/periods";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

export const metadata = { title: "Loan portfolio ageing" };

export default async function LoanAgingPage({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include financial reports." />;
  const asOf = validDate((await searchParams).asOf, todayIso());
  const society = await requireSociety();
  const r = await inSociety(ws, (tx) => loanAging(tx, ws.actor, asOf));
  const pct = (k: bigint) => (r.total > 0n ? `${((Number(k) / Number(r.total)) * 100).toFixed(1)}%` : "0.0%");
  return (
    <ReportFrame
      title="Loan portfolio ageing"
      society={society.name}
      period={`As at ${longDate(asOf)}`}
      csvHref={`/reports/export?report=loans&asOf=${asOf}`}
      filters={
        <Field label="As at" htmlFor="asOf">
          <Input id="asOf" name="asOf" type="date" defaultValue={asOf} />
        </Field>
      }
    >
      <table className="mb-8 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-muted border-border border-b text-left text-xs tracking-wider uppercase">
            <th className="py-2 font-semibold">Days overdue</th>
            <th className="py-2 text-right font-semibold">Loans</th>
            <th className="py-2 text-right font-semibold">Outstanding</th>
            <th className="py-2 text-right font-semibold">Share</th>
            <th className="py-2 text-right font-semibold">Arrears</th>
          </tr>
        </thead>
        <tbody>
          {r.buckets.map((b) => (
            <tr key={b.key} className="border-border/60 border-b">
              <td className="py-2">{b.label}</td>
              <td className="py-2 text-right">{b.count}</td>
              <td className="py-2 text-right">{formatNaira(b.outstanding)}</td>
              <td className="py-2 text-right">{pct(b.outstanding)}</td>
              <td className="py-2 text-right">{formatNaira(b.arrears)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="border-foreground border-t py-2">Total</td>
            <td className="border-foreground border-t py-2 text-right">{r.loans.length}</td>
            <td className="border-foreground border-t py-2 text-right">{formatNaira(r.total)}</td>
            <td className="border-foreground border-t py-2 text-right">100%</td>
            <td className="border-foreground border-t py-2 text-right">{formatNaira(r.buckets.reduce((s, b) => s + b.arrears, 0n) as never)}</td>
          </tr>
        </tbody>
      </table>
      {r.loans.length === 0 ? (
        <p className="text-muted text-sm">No active loans.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-muted border-border border-b text-left text-xs tracking-wider uppercase">
              <th className="py-2 font-semibold">Loan</th>
              <th className="py-2 font-semibold">Member</th>
              <th className="py-2 text-right font-semibold">Outstanding</th>
              <th className="py-2 text-right font-semibold">Arrears</th>
              <th className="py-2 text-right font-semibold">Days late</th>
            </tr>
          </thead>
          <tbody>
            {r.loans.map((l) => (
              <tr key={l.id} className="border-border/60 border-b">
                <td className="py-1.5">
                  <Link href={`/loans/${l.id}`} className="text-accent hover:underline">
                    #{l.loanNo}
                  </Link>{" "}
                  <span className="text-muted">{l.productName}</span>
                </td>
                <td className="py-1.5">
                  {l.memberName} <span className="text-muted">{l.memberNo}</span>
                </td>
                <td className="py-1.5 text-right">{formatNaira(l.position.principalOutstanding)}</td>
                <td className="py-1.5 text-right">{formatNaira(l.position.arrears)}</td>
                <td className="py-1.5 text-right">{l.position.daysPastDue ? <Badge tone="danger">{l.position.daysPastDue}</Badge> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportFrame>
  );
}
