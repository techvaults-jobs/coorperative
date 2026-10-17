import { ALLOCATION_LABELS, ALLOCATION_STRATEGIES, formatNaira } from "@techvaults/core";
import { listPayrollRuns } from "@techvaults/db";
import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { RUN_STATUS } from "@/lib/payroll-status";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { ROW_HOVER, Table, Td, Th } from "@/components/ui/table";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";
import { StartRunForm } from "./start-run-form";

export const metadata = { title: "Payroll deductions" };


const monthName = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function PayrollPage() {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "payroll.manage")) return <EmptyState title="Your role doesn't include payroll deductions." />;
  const { terminology } = await requireSociety();
  const runs = await inSociety(ws, (tx) => listPayrollRuns(tx, ws.actor));
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  const suggested = runs.some((r) => r.period === now.toISOString().slice(0, 7)) ? next : now.toISOString().slice(0, 7);

  return (
    <>
      <PageHeader
        title="Payroll deductions"
        description={`Each month: build the ${terminology.contribution.toLowerCase()} schedule, send it to the employer, load what they remit, reconcile, and post. Members are matched by ${terminology.externalId}.`}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-3" aria-label="Payroll runs">
          {runs.length === 0 ? (
            <EmptyState icon={FileSpreadsheet} title="No months yet.">
              Start with this month. The schedule comes from members&apos; monthly contributions and loan instalments due.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th numeric>Members</Th>
                  <Th numeric>Scheduled</Th>
                  <Th numeric className="hidden sm:table-cell">Remitted</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className={ROW_HOVER}>
                    <Td>
                      <Link href={`/payroll/${r.id}`} className="text-accent font-medium hover:underline">
                        {monthName(r.period)}
                      </Link>
                      <p className="text-muted text-xs">{ALLOCATION_LABELS[r.strategy].label}</p>
                    </Td>
                    <Td numeric>{r.members}</Td>
                    <Td numeric>{formatNaira(r.scheduled)}</Td>
                    <Td numeric className="hidden sm:table-cell">
                      {r.receivedOn ? formatNaira(r.remitted) : "—"}
                    </Td>
                    <Td>
                      <Badge tone={RUN_STATUS[r.status]!.tone} dot>
                        {RUN_STATUS[r.status]!.label}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
        <Card className="h-fit">
          <CardHeader title="Start a month" description="Builds the schedule; you can rebuild it until it's sent." />
          <CardBody>
            <StartRunForm
              defaultPeriod={suggested}
              strategies={ALLOCATION_STRATEGIES.map((s) => ({ value: s, label: ALLOCATION_LABELS[s].label, description: ALLOCATION_LABELS[s].description }))}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
