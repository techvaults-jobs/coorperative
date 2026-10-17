import { formatNaira } from "@techvaults/core";
import { countJournal, listJournal, listSubmissions, pendingReversalTargets } from "@techvaults/db";
import { BookOpen, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { EntryLines, entryTotal } from "@/components/entry-lines";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { ReverseEntryForm } from "./reverse-entry-form";

export const metadata = { title: "Journal" };

const PER_PAGE = 25;

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ reversal?: string; page?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include the ledger." />;
  const { reversal, page: pageParam } = await searchParams;
  const canPrepare = hasPermission(ws, "ledger.prepare");
  const canReverse = hasPermission(ws, "ledger.reverse");
  const { total, pending, reversing } = await inSociety(ws, async (tx) => ({
    total: await countJournal(tx, ws.actor),
    pending: await listSubmissions(tx, ws.actor, { status: "pending" }),
    reversing: await pendingReversalTargets(tx),
  }));
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(Math.max(1, Number(pageParam) || 1), pages);
  const journal = await inSociety(ws, (tx) => listJournal(tx, ws.actor, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE }));

  return (
    <>
      <PageHeader
        title="Journal"
        description="Every posted entry, newest first. An entry is posted only after a second officer approves it, and is never edited. A mistake is corrected by a linked reversal."
        actions={
          canPrepare && (
            <Link href="/ledger/new" className={buttonClass("primary")}>
              <Plus className="size-4" aria-hidden />
              Prepare entry
            </Link>
          )
        }
      />
      {reversal === "requested" && <Alert tone="success">Reversal requested. It will be posted when another officer approves it.</Alert>}
      {pending.length > 0 && (
        <Alert
          tone="warning"
          actions={
            <Link href="/approvals" className="font-semibold underline-offset-2 hover:underline">
              Open approvals →
            </Link>
          }
        >
          {pending.length === 1 ? "1 entry is" : `${pending.length} entries are`} waiting for approval and not yet in the journal.
        </Alert>
      )}
      <section className="flex min-w-0 flex-col gap-3" aria-label="Journal entries">
        {journal.length === 0 && (
          <EmptyState icon={BookOpen} title="No entries posted yet." action={canPrepare && <Link href="/ledger/new" className={buttonClass("primary")}>Prepare the first entry</Link>} />
        )}
        {journal.map((e) => (
          <article key={e.id} className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-5 shadow-sm">
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
                <span className="text-sm font-semibold tabular-nums">{formatNaira(entryTotal(e.lines))}</span>
              </div>
            </header>
            <EntryLines lines={e.lines} />
            {canReverse && !e.reversesEntryId && !e.reversedByEntryId && !reversing.has(e.id) && <ReverseEntryForm entryId={e.id} idempotencyKey={randomUUID()} />}
          </article>
        ))}
      </section>
      {pages > 1 && (
        <nav aria-label="Journal pages" className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted">
            Entries {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total.toLocaleString("en-NG")}
          </p>
          <div className="flex gap-2">
            <Link
              href={`/ledger?page=${page - 1}`}
              aria-disabled={page <= 1}
              className={cn(buttonClass("secondary", undefined, "sm"), page <= 1 && "pointer-events-none opacity-50")}
            >
              <ChevronLeft className="size-4" aria-hidden /> Newer
            </Link>
            <Link
              href={`/ledger?page=${page + 1}`}
              aria-disabled={page >= pages}
              className={cn(buttonClass("secondary", undefined, "sm"), page >= pages && "pointer-events-none opacity-50")}
            >
              Older <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </nav>
      )}
    </>
  );
}
