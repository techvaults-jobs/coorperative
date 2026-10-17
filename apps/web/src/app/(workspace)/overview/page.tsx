import { formatNaira, type Kobo } from "@techvaults/core";
import { listJournal, listMembers, trialBalance } from "@techvaults/db";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Overview · TechVaults Cooperative" };

export default async function OverviewPage() {
  const ws = await requireWorkspace();
  const canLedger = hasPermission(ws, "ledger.read");
  const canMembers = hasPermission(ws, "members.read");
  const data = await inSociety(ws, async (tx) => ({
    members: canMembers ? await listMembers(tx, ws.actor) : [],
    tb: canLedger ? await trialBalance(tx) : [],
    recent: canLedger ? await listJournal(tx, ws.actor, { limit: 5 }) : [],
  }));

  const byClassTotal = (cls: string, codePrefix?: string) =>
    data.tb.filter((r) => r.class === cls && (!codePrefix || r.code.startsWith(codePrefix))).reduce((s, r) => s + r.balance, 0n) as Kobo;
  const active = data.members.filter((m) => m.status === "active").length;
  const tiles = [
    { label: "Active members", value: canMembers ? active.toLocaleString("en-NG") : "—" },
    { label: "Members' savings", value: canLedger ? formatNaira(byClassTotal("liability", "21")) : "—" },
    { label: "Share capital", value: canLedger ? formatNaira(byClassTotal("equity", "31")) : "—" },
    { label: "Loans outstanding", value: canLedger ? formatNaira(byClassTotal("asset", "13")) : "—" },
  ];

  return (
    <>
      <PageHeader title="Overview" description={`${ws.society.societyName}. Figures come straight from posted journal entries.`} />
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="border-border bg-surface flex flex-col gap-1 rounded-lg border p-4">
            <dt className="text-muted text-xs">{t.label}</dt>
            <dd className="tabular font-mono text-xl font-semibold">{t.value}</dd>
          </div>
        ))}
      </dl>
      {canLedger && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Recent entries</h2>
            <Link href="/ledger" className="text-accent text-sm hover:underline">
              Open journal →
            </Link>
          </div>
          <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
            {data.recent.length === 0 && <li className="text-muted px-4 py-6 text-sm">No entries posted yet.</li>}
            {data.recent.map((e) => {
              const total = e.lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0n) as Kobo;
              return (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="text-muted mr-2 font-mono text-xs">#{e.entryNo.toString()}</span>
                    {e.description}
                  </span>
                  <span className="tabular font-mono">{formatNaira(total)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
