import { formatNaira } from "@techvaults/core";
import { listAccounts, listJournal, listMembers, listSubmissions, pendingReversalTargets } from "@techvaults/db";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { EntryLines, entryTotal } from "@/components/entry-lines";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { PostEntryForm } from "./post-entry-form";
import { ReverseEntryForm } from "./reverse-entry-form";

export const metadata = { title: "Journal · TechVaults Cooperative" };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ reversal?: string }> }) {
  const ws = await requireWorkspace();
  const { reversal } = await searchParams;
  if (!hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include the ledger." />;
  const canPrepare = hasPermission(ws, "ledger.prepare");
  const canReverse = hasPermission(ws, "ledger.reverse");
  const { journal, accounts, members, pending, reversing } = await inSociety(ws, async (tx) => ({
    journal: await listJournal(tx, ws.actor, { limit: 100 }),
    accounts: canPrepare ? await listAccounts(tx, ws.actor) : [],
    members: canPrepare && hasPermission(ws, "members.read") ? await listMembers(tx, ws.actor) : [],
    pending: await listSubmissions(tx, ws.actor, { status: "pending" }),
    reversing: await pendingReversalTargets(tx),
  }));

  return (
    <>
      <PageHeader
        title="Journal"
        description="Every posted entry, newest first. An entry is posted only after a second officer approves it, and is never edited. A mistake is corrected by a linked reversal."
      />
      {reversal === "requested" && (
        <p role="status" className="bg-accent-soft text-accent rounded-md px-4 py-3 text-sm">
          Reversal requested. It will be posted when another officer approves it.
        </p>
      )}
      {pending.length > 0 && (
        <p role="status" className="bg-warning-soft text-warning flex flex-wrap items-center justify-between gap-2 rounded-md px-4 py-3 text-sm">
          <span>
            {pending.length === 1 ? "1 entry is" : `${pending.length} entries are`} waiting for approval and not yet in the journal.
          </span>
          <Link href="/approvals" className="font-medium underline-offset-2 hover:underline">
            Open approvals →
          </Link>
        </p>
      )}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-3">
          {journal.length === 0 && <EmptyState title="No entries posted yet." />}
          {journal.map((e) => {
            const total = entryTotal(e.lines);
            return (
              <article key={e.id} className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium">
                      <span className="text-muted mr-2 font-mono text-xs">#{e.entryNo.toString()}</span>
                      {e.description}
                    </p>
                    <p className="text-muted text-xs">
                      {e.entryDate} · prepared by {e.preparedByName}
                      {e.postedByName !== e.preparedByName && <> · approved by {e.postedByName}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.reversesEntryId && <Badge tone="warning">Reversal</Badge>}
                    {e.reversedByEntryId && <Badge tone="neutral">Reversed</Badge>}
                    {reversing.has(e.id) && <Badge tone="warning">Reversal awaiting approval</Badge>}
                    <span className="tabular font-mono text-sm font-semibold">{formatNaira(total)}</span>
                  </div>
                </header>
                <EntryLines lines={e.lines} />
                {canReverse && !e.reversesEntryId && !e.reversedByEntryId && !reversing.has(e.id) && (
                  <ReverseEntryForm entryId={e.id} idempotencyKey={randomUUID()} />
                )}
              </article>
            );
          })}
        </section>
        {canPrepare && (
          <aside className="border-border bg-surface flex h-fit flex-col gap-4 rounded-lg border p-5 xl:sticky xl:top-8">
            <div>
              <h2 className="font-semibold">Prepare an entry</h2>
              <p className="text-muted text-xs">
                A two-line entry: one account debited, one credited, same amount. Another officer approves it before it is posted.
              </p>
            </div>
            <PostEntryForm
              idempotencyKey={randomUUID()}
              today={new Date().toISOString().slice(0, 10)}
              accounts={accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, label: `${a.code} · ${a.name}`, memberControl: a.isMemberControl }))}
              members={members.filter((m) => m.status === "active").map((m) => ({ id: m.id, label: `${m.memberNo} · ${m.fullName}` }))}
            />
          </aside>
        )}
      </div>
    </>
  );
}
