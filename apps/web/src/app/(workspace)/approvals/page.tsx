import { formatNaira } from "@techvaults/core";
import { listSubmissions } from "@techvaults/db";
import { EntryLines, entryTotal } from "@/components/entry-lines";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { DecisionForm } from "./decision-form";

export const metadata = { title: "Approvals" };

const when = (d: Date) => d.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

const DONE: Record<string, string> = {
  rejected: "Rejected. The preparer can see your reason below.",
  withdrawn: "Withdrawn. Nothing was posted.",
};

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const ws = await requireWorkspace();
  const canApprove = hasPermission(ws, "ledger.approve");
  if (!canApprove && !hasPermission(ws, "ledger.prepare") && !hasPermission(ws, "ledger.read")) {
    return <EmptyState title="Your role doesn't include the ledger." />;
  }
  const { done } = await searchParams;
  const submissions = await inSociety(ws, (tx) => listSubmissions(tx, ws.actor, { limit: 100 }));
  const pending = submissions.filter((s) => s.status === "pending");
  const decided = submissions.filter((s) => s.status !== "pending").slice(0, 30);
  const posted = done?.match(/^posted-(\d+)$/)?.[1];
  const notice = posted ? `Approved and posted as entry #${posted}.` : done ? DONE[done] : undefined;

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Entries prepared by one officer wait here until a different officer approves them. Nothing reaches the journal or any balance until then."
      />
      {notice && (
        <Alert tone={done === "rejected" ? "info" : "success"}>{notice}</Alert>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="font-semibold">
          Waiting for approval <span className="text-muted font-normal">({pending.length})</span>
        </h2>
        {pending.length === 0 && <EmptyState title="Nothing is waiting for approval." />}
        {pending.map((s) => {
          const mine = s.preparedBy === ws.user.id;
          return (
            <article key={s.id} className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-5 shadow-sm">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm font-medium">{s.description}</p>
                  <p className="text-muted text-xs">
                    Accounting date {s.entryDate} · prepared by {mine ? "you" : s.preparedByName} on {when(s.preparedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {s.reversesEntryId && <Badge tone="warning">Reversal</Badge>}
                  <span className="tabular font-mono text-sm font-semibold">{formatNaira(entryTotal(s.lines))}</span>
                </div>
              </header>
              <EntryLines lines={s.lines} />
              {mine ? (
                <DecisionForm submissionId={s.id} mode="withdraw" />
              ) : canApprove ? (
                <DecisionForm submissionId={s.id} mode="decide" />
              ) : (
                <p className="text-muted text-xs">Waiting for an officer who can approve entries.</p>
              )}
            </article>
          );
        })}
      </section>

      {decided.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="decided-heading">
          <h2 id="decided-heading" className="font-semibold">
            Recent decisions
          </h2>
          <Table>
            <thead>
              <tr>
                <Th>Decided</Th>
                <Th>Entry</Th>
                <Th>Prepared by</Th>
                <Th>Outcome</Th>
                <Th numeric>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {decided.map((s) => (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap">{s.decidedAt ? when(s.decidedAt) : ""}</Td>
                  <Td>
                    {s.description}
                    {s.decisionReason && <p className="text-muted text-xs">Reason: {s.decisionReason}</p>}
                  </Td>
                  <Td>{s.preparedByName}</Td>
                  <Td>
                    {s.status === "approved" && <Badge tone="good">Posted #{s.entryNo?.toString()}</Badge>}
                    {s.status === "rejected" && <Badge tone="danger">Rejected</Badge>}
                    {s.status === "withdrawn" && <Badge tone="neutral">Withdrawn</Badge>}
                    {s.decidedByName && s.status !== "withdrawn" && <p className="text-muted mt-1 text-xs">by {s.decidedByName}</p>}
                  </Td>
                  <Td numeric>{formatNaira(entryTotal(s.lines))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </>
  );
}
