import { ALLOCATION_LABELS, formatNaira, kobo } from "@techvaults/core";
import { getPayrollRun, listAccounts, payrollReconciliation, payrollSchedule } from "@techvaults/db";
import { Check, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Table, Td, Th } from "@/components/ui/table";
import { RUN_STATUS } from "@/lib/payroll-status";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";
import { RunStepForm } from "./run-step-form";

export const metadata = { title: "Payroll month" };

const STEPS = ["draft", "issued", "reconciled", "submitted", "posted"] as const;
const STEP_LABELS = ["Build schedule", "Send to employer", "Reconcile remittance", "Approve posting", "Posted"];
const RECON: Record<string, { label: string; tone: Tone }> = {
  ok: { label: "Matched", tone: "good" },
  short: { label: "Short", tone: "warning" },
  over: { label: "Over", tone: "info" },
  missing: { label: "Not remitted", tone: "danger" },
  unscheduled: { label: "Not on schedule", tone: "info" },
};
const DONE: Record<string, string> = {
  issue: "Schedule frozen. Download it and send it to the employer's payroll office.",
  rebuild: "Schedule rebuilt from current contributions and loans.",
  import: "Remittance loaded and reconciled. Check the exceptions, then submit for posting.",
  submit: "Posting prepared. It reaches the ledger when another officer approves it in Approvals.",
};

export default async function PayrollRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "payroll.manage")) return <EmptyState title="Your role doesn't include payroll deductions." />;
  const { id } = await params;
  const { done } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { terminology } = await requireSociety();
  const data = await inSociety(ws, async (tx) => {
    const run = await getPayrollRun(tx, ws.actor, id);
    if (!run) return null;
    return {
      run,
      schedule: await payrollSchedule(tx, ws.actor, id),
      recon: ["reconciled", "submitted", "posted"].includes(run.status) ? await payrollReconciliation(tx, ws.actor, id) : null,
      banks: hasPermission(ws, "ledger.prepare") ? (await listAccounts(tx, ws.actor)).filter((a) => a.class === "asset" && !a.isMemberControl && a.isActive) : [],
    };
  });
  if (!data) notFound();
  const { run, schedule, recon, banks } = data;
  const stepIndex = STEPS.indexOf(run.status);
  const month = new Date(`${run.period}-01T00:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
  const sum = (k: "savings" | "shares" | "loans") => kobo(schedule.reduce((s, r) => s + r[k], 0n));
  const noId = schedule.filter((r) => !r.externalId).length;

  return (
    <>
      <PageHeader
        back={{ href: "/payroll", label: "Payroll deductions" }}
        title={month}
        description={`Shortfalls allocated: ${ALLOCATION_LABELS[run.strategy].label.toLowerCase()} (provisional).`}
        actions={
          <Badge tone={RUN_STATUS[run.status]!.tone} dot>
            {RUN_STATUS[run.status]!.label}
          </Badge>
        }
      />
      {done && DONE[done] && <Alert tone="success">{DONE[done]}</Alert>}

      <ol aria-label="Progress" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            aria-current={i === stepIndex ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
              i < stepIndex || run.status === "posted" ? "border-success/30 bg-success-soft text-success" : i === stepIndex ? "border-accent bg-accent-soft text-accent" : "border-border text-muted",
            )}
          >
            {i < stepIndex || run.status === "posted" ? <Check className="size-3.5" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}
            {label}
          </li>
        ))}
      </ol>

      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Scheduled" value={formatNaira(run.scheduled)} footnote={`${run.members} members`} />
        <StatCard label="Savings & shares" value={formatNaira(kobo(sum("savings") + sum("shares")))} />
        <StatCard label="Loan repayments" value={formatNaira(sum("loans"))} />
        <StatCard label="Remitted" value={recon ? formatNaira(recon.totals.remitted) : "—"} footnote={run.receivedOn ? `received ${run.receivedOn}` : "Not yet received"} />
      </section>

      {run.status === "draft" && (
        <Card>
          <CardHeader title="Check the schedule" description="Rebuild it if you change contributions or loans. Sending it freezes it." />
          <CardBody className="flex flex-col gap-3">
            {noId > 0 && (
              <Alert tone="warning">
                {noId} member{noId === 1 ? " has" : "s have"} no {terminology.externalId}, so the employer can&apos;t match them. Add it on their member page.
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <RunStepForm runId={run.id} step="issue" label="Freeze and send to employer" />
              <RunStepForm runId={run.id} step="rebuild" label="Rebuild schedule" variant="secondary" />
            </div>
          </CardBody>
        </Card>
      )}
      {(run.status === "issued" || run.status === "reconciled") && (
        <Card>
          <CardHeader
            title={run.status === "issued" ? "Load the remittance" : "Reload the remittance"}
            description={`A CSV with a ${terminology.externalId} column and an amount column, one row per member. Reloading replaces the previous file.`}
            actions={
              <a href={`/payroll/${run.id}/schedule.csv`} className={buttonClass("secondary", undefined, "sm")} download>
                <Download className="size-4" aria-hidden />
                Download schedule (CSV)
              </a>
            }
          />
          <CardBody>
            <RunStepForm runId={run.id} step="import" label="Load and reconcile" upload variant={run.status === "reconciled" ? "secondary" : "primary"} />
          </CardBody>
        </Card>
      )}
      {run.status === "reconciled" && recon && hasPermission(ws, "ledger.prepare") && (
        <Card>
          <CardHeader
            title="Submit for posting"
            description={`One journal entry: ${formatNaira(recon.totals.remitted)} into the bank, credited to members${recon.totals.unmatched > 0n ? `, with ${formatNaira(recon.totals.unmatched)} unidentified held in suspense (2900)` : ""}. Another officer approves it.`}
          />
          <CardBody>
            <RunStepForm runId={run.id} step="submit" label="Submit for posting" banks={banks.map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }))} idempotencyKey={randomUUID()} />
          </CardBody>
        </Card>
      )}
      {run.status === "submitted" && (
        <Alert tone="info" actions={<Link href="/approvals" className="font-semibold hover:underline">Open approvals →</Link>}>
          The posting is waiting for another officer&apos;s approval.
        </Alert>
      )}

      {recon ? (
        <section className="flex flex-col gap-3" aria-labelledby="recon-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="recon-heading" className="text-[15px] font-semibold">
              Reconciliation
            </h2>
            <p className="text-muted text-xs">
              Shortfall {formatNaira(recon.totals.shortfall)} · Excess {formatNaira(recon.totals.excess)} · Unidentified {formatNaira(recon.totals.unmatched)}
            </p>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th className="hidden sm:table-cell">{terminology.externalId}</Th>
                <Th numeric>Scheduled</Th>
                <Th numeric>Remitted</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {[...recon.rows]
                .sort((a, b) => Number(a.status === "ok") - Number(b.status === "ok") || a.memberNo.localeCompare(b.memberNo))
                .map((r) => (
                  <tr key={r.memberId}>
                    <Td>
                      <Link href={`/members/${r.memberId}`} className="hover:text-accent font-medium">
                        {r.name}
                      </Link>
                      <p className="text-muted text-xs">{r.memberNo}</p>
                    </Td>
                    <Td className="hidden font-mono text-[13px] sm:table-cell">{r.externalId ?? "—"}</Td>
                    <Td numeric>{formatNaira(r.scheduled)}</Td>
                    <Td numeric>{formatNaira(r.remitted)}</Td>
                    <Td>
                      <Badge tone={RECON[r.status]!.tone} dot>
                        {RECON[r.status]!.label}
                        {r.lines > 1 && ` · ${r.lines} lines`}
                      </Badge>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
          {recon.unmatched.length > 0 && (
            <Card>
              <CardHeader title="Unidentified lines" description={`These ${terminology.externalId}s don't match any member. The money is held in suspense until it's traced.`} />
              <CardBody className="pt-3">
                <ul className="flex flex-col gap-1.5 text-sm">
                  {recon.unmatched.map((u) => (
                    <li key={u.line} className="flex justify-between gap-3">
                      <span>
                        Line {u.line}: <span className="font-mono">{u.externalId}</span> {u.name && <span className="text-muted">· {u.name}</span>}
                      </span>
                      <span className="tabular-nums">{formatNaira(u.amount)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="schedule-heading">
          <h2 id="schedule-heading" className="text-[15px] font-semibold">
            Schedule
          </h2>
          {schedule.length === 0 ? (
            <EmptyState title="Nothing scheduled.">Set members&apos; monthly contributions on their member pages, then rebuild.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th className="hidden sm:table-cell">{terminology.externalId}</Th>
                  <Th numeric className="hidden md:table-cell">Savings</Th>
                  <Th numeric className="hidden md:table-cell">Shares</Th>
                  <Th numeric className="hidden md:table-cell">Loans</Th>
                  <Th numeric>Total</Th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((r) => (
                  <tr key={r.memberId}>
                    <Td>
                      <span className="font-medium">{r.name}</span>
                      <p className="text-muted text-xs">{r.memberNo}</p>
                    </Td>
                    <Td className="hidden font-mono text-[13px] sm:table-cell">{r.externalId ?? <span className="text-danger">missing</span>}</Td>
                    <Td numeric className="hidden md:table-cell">
                      {formatNaira(r.savings)}
                    </Td>
                    <Td numeric className="hidden md:table-cell">
                      {formatNaira(r.shares)}
                    </Td>
                    <Td numeric className="hidden md:table-cell">
                      {formatNaira(r.loans)}
                    </Td>
                    <Td numeric className="font-semibold">
                      {formatNaira(r.total)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      )}
    </>
  );
}
