import { formatNaira, type Kobo } from "@techvaults/core";
import { listAccounts, listJournal, listMembers } from "@techvaults/db";
import { randomUUID } from "node:crypto";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { PostEntryForm } from "./post-entry-form";
import { ReverseEntryForm } from "./reverse-entry-form";

export const metadata = { title: "Journal · TechVaults Cooperative" };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ reversal?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include the ledger." />;
  const { reversal } = await searchParams;
  const canPost = hasPermission(ws, "ledger.post");
  const canReverse = hasPermission(ws, "ledger.reverse");
  const { journal, accounts, members } = await inSociety(ws, async (tx) => ({
    journal: await listJournal(tx, ws.actor, { limit: 100 }),
    accounts: canPost ? await listAccounts(tx, ws.actor) : [],
    members: canPost && hasPermission(ws, "members.read") ? await listMembers(tx, ws.actor) : [],
  }));

  return (
    <>
      <PageHeader
        title="Journal"
        description="Every posted entry, newest first. Entries are never edited. A mistake is corrected by a linked reversal."
      />
      {reversal && /^\d+$/.test(reversal) && (
        <p role="status" className="bg-accent-soft text-accent rounded-md px-4 py-3 text-sm">
          Reversed. The correction is entry #{reversal}.
        </p>
      )}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-3">
          {journal.length === 0 && <EmptyState title="No entries posted yet." />}
          {journal.map((e) => {
            const total = e.lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0n) as Kobo;
            return (
              <article key={e.id} className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium">
                      <span className="text-muted mr-2 font-mono text-xs">#{e.entryNo.toString()}</span>
                      {e.description}
                    </p>
                    <p className="text-muted text-xs">
                      {e.entryDate} · posted by {e.postedByName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.reversesEntryId && <Badge tone="warning">Reversal</Badge>}
                    {e.reversedByEntryId && <Badge tone="neutral">Reversed</Badge>}
                    <span className="tabular font-mono text-sm font-semibold">{formatNaira(total)}</span>
                  </div>
                </header>
                <div className="overflow-x-auto">
                  <table className="tabular w-full text-sm">
                    <tbody>
                      {e.lines.map((l, i) => (
                        <tr key={i} className="border-border border-t">
                          <td className={`py-1.5 pr-3 ${l.side === "credit" ? "pl-6" : ""}`}>
                            <span className="text-muted mr-2 font-mono text-xs">{l.accountCode}</span>
                            {l.accountName}
                            {l.memberName && <span className="text-muted"> · {l.memberNo} {l.memberName}</span>}
                          </td>
                          <td className="w-32 py-1.5 text-right font-mono">{l.side === "debit" ? formatNaira(l.amount, { symbol: false }) : ""}</td>
                          <td className="w-32 py-1.5 text-right font-mono">{l.side === "credit" ? formatNaira(l.amount, { symbol: false }) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canReverse && !e.reversesEntryId && !e.reversedByEntryId && <ReverseEntryForm entryId={e.id} />}
              </article>
            );
          })}
        </section>
        {canPost && (
          <aside className="border-border bg-surface flex h-fit flex-col gap-4 rounded-lg border p-5 xl:sticky xl:top-8">
            <div>
              <h2 className="font-semibold">Post an entry</h2>
              <p className="text-muted text-xs">A two-line entry: one account debited, one credited, same amount.</p>
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
