import { formatNaira } from "@techvaults/core";
import { getMember, listJournal, memberBalances } from "@techvaults/db";
import { Briefcase, CalendarDays, Hash, Landmark, Mail, Phone, PiggyBank, ShieldCheck, Wallet } from "lucide-react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { ROW_HOVER, Table, Td, Th } from "@/components/ui/table";
import { MEMBER_STATUS } from "@/lib/member-status";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

export const metadata = { title: "Member" };

const ICONS = { "21": PiggyBank, "31": Landmark, "13": Wallet } as Record<string, typeof Wallet>;

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "members.read")) return <EmptyState title="Your role doesn't include the member register." />;
  const { id } = await params;
  const { terminology: terms } = await requireSociety();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await inSociety(ws, async (tx) => {
    const member = await getMember(tx, ws.actor, id);
    if (!member) return null;
    const canLedger = hasPermission(ws, "ledger.read");
    return {
      member,
      balances: canLedger ? await memberBalances(tx, id) : null,
      entries: canLedger ? await listJournal(tx, ws.actor, { memberId: id, limit: 200 }) : [],
    };
  });
  if (!data) notFound();
  const { member, balances, entries } = data;
  const status = MEMBER_STATUS[member.status];
  const details = [
    { icon: Hash, label: terms.externalId, value: member.staffId },
    { icon: Briefcase, label: terms.group, value: member.department },
    { icon: Phone, label: "Phone", value: member.phone },
    { icon: Mail, label: "Email", value: member.email },
    { icon: CalendarDays, label: "Joined", value: member.joinedOn },
    { icon: ShieldCheck, label: "Nominee (Act s.18)", value: member.nomineeName ? `${member.nomineeName}${member.nomineeRelationship ? ` (${member.nomineeRelationship})` : ""}` : null },
  ];
  const lines = entries.flatMap((e) => e.lines.filter((l) => l.memberNo === member.memberNo).map((l, i) => ({ e, l, key: `${e.id}-${i}` })));

  return (
    <>
      <PageHeader back={{ href: "/members", label: "Members" }} title={member.fullName} />
      <Card>
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={member.fullName} size="xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted font-mono text-sm">{member.memberNo}</span>
              <Badge tone={status?.tone} dot>
                {status?.label ?? member.status}
              </Badge>
            </div>
            <p className="text-muted text-sm">
              {[member.department, member.joinedOn && `member since ${member.joinedOn}`].filter(Boolean).join(" · ") || `No ${terms.group.toLowerCase()} recorded`}
            </p>
          </div>
        </CardBody>
      </Card>

      {balances && (
        <section aria-label="Balances" className="grid gap-4 sm:grid-cols-3">
          <h2 className="sr-only">Balances</h2>
          {balances.length === 0 ? (
            <EmptyState className="sm:col-span-3" title="No transactions yet." />
          ) : (
            balances.map((b) => <StatCard key={b.code} label={b.name} icon={ICONS[b.code.slice(0, 2)]} value={formatNaira(b.balance)} />)
          )}
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader title="Profile" />
          <CardBody>
            <dl className="flex flex-col gap-4">
              {details.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="bg-surface-2 text-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-muted text-xs">{label}</dt>
                    <dd className="truncate text-sm">{value || "—"}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        {balances && (
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="text-[15px] font-semibold">Statement</h2>
            {lines.length === 0 ? (
              <EmptyState title="No entries for this member yet." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Entry</Th>
                    <Th className="hidden md:table-cell">Account</Th>
                    <Th numeric>Debit</Th>
                    <Th numeric>Credit</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(({ e, l, key }) => (
                    <tr key={key} className={ROW_HOVER}>
                      <Td className="font-mono text-[13px] whitespace-nowrap">{e.entryDate}</Td>
                      <Td>
                        <span className="text-subtle mr-1.5 font-mono text-xs">#{e.entryNo.toString()}</span>
                        {e.description}
                      </Td>
                      <Td className="text-muted hidden md:table-cell">{l.accountName}</Td>
                      <Td numeric>{l.side === "debit" ? formatNaira(l.amount, { symbol: false }) : ""}</Td>
                      <Td numeric>{l.side === "credit" ? formatNaira(l.amount, { symbol: false }) : ""}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        )}
      </div>
    </>
  );
}
