import { formatNaira } from "@techvaults/core";
import { getMember, listJournal, memberBalances } from "@techvaults/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "members.read")) return <EmptyState title="Your role doesn't include the member register." />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await inSociety(ws, async (tx) => {
    const member = await getMember(tx, ws.actor, id);
    if (!member) return null;
    const canLedger = hasPermission(ws, "ledger.read");
    return {
      member,
      balances: canLedger ? await memberBalances(tx, id) : null,
      entries: canLedger ? await listJournal(tx, ws.actor, { memberId: id, limit: 100 }) : [],
    };
  });
  if (!data) notFound();
  const { member, balances, entries } = data;
  const details: [string, string | null][] = [
    ["Staff ID", member.staffId],
    ["Department", member.department],
    ["Phone", member.phone],
    ["Email", member.email],
    ["Joined", member.joinedOn],
    ["Nominee (Act s.18)", member.nomineeName],
  ];

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/members" className="text-muted text-sm hover:underline">
          ← Members
        </Link>
        <PageHeader title={member.fullName} description={`Member ${member.memberNo}`} actions={<Badge tone={member.status === "active" ? "good" : "neutral"}>{member.status}</Badge>} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <dl className="border-border bg-surface flex h-fit flex-col gap-3 rounded-lg border p-5 text-sm">
          {details.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-muted text-xs">{k}</dt>
              <dd>{v || "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="flex min-w-0 flex-col gap-6">
          {balances && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Balances</h2>
              {balances.length === 0 ? (
                <EmptyState title="No transactions yet." />
              ) : (
                <dl className="grid gap-3 sm:grid-cols-3">
                  {balances.map((b) => (
                    <div key={b.code} className="border-border bg-surface rounded-lg border p-4">
                      <dt className="text-muted text-xs">{b.name}</dt>
                      <dd className="tabular font-mono text-lg font-semibold">{formatNaira(b.balance)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}
          {entries.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Statement</h2>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Entry</Th>
                    <Th>Account</Th>
                    <Th numeric>Debit</Th>
                    <Th numeric>Credit</Th>
                  </tr>
                </thead>
                <tbody>
                  {entries.flatMap((e) =>
                    e.lines
                      .filter((l) => l.memberNo === member.memberNo)
                      .map((l, i) => (
                        <tr key={`${e.id}-${i}`}>
                          <Td className="font-mono whitespace-nowrap">{e.entryDate}</Td>
                          <Td>
                            <span className="text-muted mr-1 font-mono text-xs">#{e.entryNo.toString()}</span>
                            {e.description}
                          </Td>
                          <Td>{l.accountName}</Td>
                          <Td numeric>{l.side === "debit" ? formatNaira(l.amount, { symbol: false }) : ""}</Td>
                          <Td numeric>{l.side === "credit" ? formatNaira(l.amount, { symbol: false }) : ""}</Td>
                        </tr>
                      )),
                  )}
                </tbody>
              </Table>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
