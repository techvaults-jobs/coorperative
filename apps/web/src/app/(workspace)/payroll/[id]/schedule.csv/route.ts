import { toCsv } from "@techvaults/core";
import { getPayrollRun, payrollSchedule } from "@techvaults/db";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

const naira = (k: bigint) => (Number(k) / 100).toFixed(2);

/** The deduction schedule as a CSV file for the employer's payroll office. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "payroll.manage")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const society = await requireSociety();
  const data = await inSociety(ws, async (tx) => {
    const run = await getPayrollRun(tx, ws.actor, id);
    return run ? { run, rows: await payrollSchedule(tx, ws.actor, id) } : null;
  });
  if (!data) return new Response("Not found", { status: 404 });
  const csv = toCsv([
    [society.terminology.externalId, "Name", "Member no.", "Savings", "Shares", "Loan repayment", "Total"],
    ...data.rows.map((r) => [r.externalId ?? "", r.name, r.memberNo, naira(r.savings), naira(r.shares), naira(r.loans), naira(r.total)]),
  ]);
  const name = `${(society.shortName || society.slug).replace(/[^A-Za-z0-9-]+/g, "-")}-deductions-${data.run.period}.csv`;
  return new Response("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
