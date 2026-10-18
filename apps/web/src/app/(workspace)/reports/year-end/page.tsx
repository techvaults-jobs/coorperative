import { formatNaira } from "@techvaults/core";
import { lastCompletedYear, listClosedYears, previewYearEnd } from "@techvaults/db";
import { Lock } from "lucide-react";
import { ReportFrame, ReportSection } from "@/components/report-frame";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/page-header";
import { longDate, todayIso, validDate } from "@/lib/periods";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";
import { CloseYearForm } from "./close-year-form";

export const metadata = { title: "Year-end close" };

export default async function YearEndPage({ searchParams }: { searchParams: Promise<{ end?: string }> }) {
  const ws = await requireWorkspace();
  const canClose = hasPermission(ws, "accounts.manage") || hasPermission(ws, "ledger.prepare");
  if (!canClose) return <EmptyState title="Your role can't close the year." />;
  const society = await requireSociety();
  const fallback = lastCompletedYear(todayIso(), society.financialYearStart);
  const end = validDate((await searchParams).end, fallback.end);
  // The year ending on `end`: twelve months back to the day after.
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
  startDate.setUTCDate(startDate.getUTCDate() + 1);
  const year = { start: startDate.toISOString().slice(0, 10), end };
  const { preview, closed } = await inSociety(ws, async (tx) => ({ preview: await previewYearEnd(tx, ws.actor, year), closed: await listClosedYears(tx, ws.actor) }));
  const line = (l: { code: string; name: string; amount: bigint }) => ({ label: `${l.code} · ${l.name}`, amount: formatNaira(l.amount as never), sub: true });

  return (
    <ReportFrame
      title="Year-end close"
      society={society.name}
      period={`Financial year ${longDate(year.start)} to ${longDate(year.end)}`}
      filters={
        <Field label="Year ending" htmlFor="end">
          <Input id="end" name="end" type="date" defaultValue={end} />
        </Field>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {preview.status === "closed" && (
            <Alert tone="success" title="This year is closed" className="mb-4">
              Its income and expenses are in reserves, and no more entries can be dated in it.
            </Alert>
          )}
          {preview.status === "closing" && (
            <Alert tone="warning" className="mb-4">
              The closing entry is waiting for another officer&apos;s approval.
            </Alert>
          )}
          <ReportSection title="Income" rows={preview.lines.filter((l) => l.class === "income").map(line)} total={formatNaira(preview.income)} />
          <ReportSection title="Expenditure" rows={preview.lines.filter((l) => l.class === "expense").map(line)} total={formatNaira(preview.expenses)} />
          <ReportSection
            title="Closing"
            rows={[
              { label: "25% to the statutory reserve fund (Act s.34)", amount: formatNaira(preview.statutoryReserve), sub: true },
              { label: "To accumulated surplus, for the AGM to appropriate", amount: formatNaira((preview.surplus - preview.statutoryReserve) as never), sub: true },
            ]}
            total={formatNaira(preview.surplus)}
            totalLabel={preview.surplus < 0n ? "Deficit for the year" : "Surplus for the year"}
          />
        </div>
        <div className="flex flex-col gap-4">
          {preview.status === "open" && (
            <Card>
              <CardHeader title="Close this year" description="One closing entry, approved by a second officer. Once it posts, the year is locked against new entries." />
              <CardBody>
                <CloseYearForm start={year.start} end={year.end} disabled={preview.lines.length === 0} />
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Closed years" />
            <ul className="divide-border mt-3 divide-y">
              {closed.length === 0 && <li className="text-muted px-5 pb-5 text-sm">None yet.</li>}
              {closed.map((y) => (
                <li key={y.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span>
                    <span className="block font-medium">Year to {y.endDate}</span>
                    <span className="text-muted text-xs">Surplus {formatNaira(y.surplus as never)}</span>
                  </span>
                  <Badge tone={y.status === "closed" ? "good" : y.status === "closing" ? "warning" : "neutral"}>
                    {y.status === "closed" && <Lock className="size-3" aria-hidden />}
                    {y.status === "closed" ? "Closed" : y.status === "closing" ? "Awaiting approval" : "Abandoned"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-muted text-xs">Other appropriations (education fund, dividends, bonuses) are decided at the AGM and posted as ordinary entries.</p>
        </div>
      </div>
    </ReportFrame>
  );
}
