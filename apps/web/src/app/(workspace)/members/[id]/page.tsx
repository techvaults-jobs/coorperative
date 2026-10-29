import { formatNaira } from "@techvaults/core";
import { getMember, listContributions, listJournal, listLoans, listProducts, memberBalances, memberPortalStatus } from "@techvaults/db";
import Link from "next/link";
import { Briefcase, CalendarDays, Hash, Landmark, Mail, Phone, PiggyBank, ShieldCheck, Wallet } from "lucide-react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { LOAN_STATUS } from "@/lib/loan-status";
import { ContributionsForm } from "./contributions-form";
import { PortalInvite } from "./portal-invite";
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
  const { terminology: terms, modules } = await requireSociety();
  const showContributions = hasPermission(ws, "payroll.manage") || hasPermission(ws, "collections.manage") || hasPermission(ws, "members.read");
  const showLoans = modules.includes("loans") && (hasPermission(ws, "loans.prepare") || hasPermission(ws, "loans.approve") || hasPermission(ws, "ledger.read"));
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await inSociety(ws, async (tx) => {
    const member = await getMember(tx, ws.actor, id);
    if (!member) return null;
    const canLedger = hasPermission(ws, "ledger.read");
    return {
      member,
      balances: canLedger ? await memberBalances(tx, id) : null,
      entries: canLedger ? await listJournal(tx, ws.actor, { memberId: id, limit: 200 }) : [],
      loans: showLoans ? await listLoans(tx, ws.actor, { memberId: id }) : [],
      contributions: showContributions ? await listContributions(tx, ws.actor, { memberId: id }) : [],
      portal: hasPermission(ws, "members.write") || hasPermission(ws, "officers.manage") ? await memberPortalStatus(tx, ws.actor, id) : null,
      savingProducts: showContributions ? (await listProducts(tx, ws.actor)).filter((p) => p.kind !== "loan" && p.status === "active") : [],
    };
  });
  if (!data) notFound();
  const { member, balances, entries, loans, contributions, savingProducts, portal } = data;
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
      <PageHeader
        back={{ href: "/members", label: "Members" }}
        title={member.fullName}
        actions={
          balances && (
            <Link href={`/members/${member.id}/statement`} className={buttonClass("secondary")}>
              Statement
            </Link>
          )
        }
      />
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

      {portal && member.status === "active" && (
        <Card>
          <CardHeader
            title="Member portal"
            description={
              portal.email
                ? `Uses the portal as ${portal.email}: sees their own balances, statements and loans, and can apply for loans.`
                : portal.invited
                  ? `Invited as ${portal.invited.email}; the link expires ${portal.invited.expiresAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}. Creating a new link replaces it.`
                  : "Let the member see their own balances, statements and loans online, and apply for loans."
            }
          />
          {!portal.email && (
            <CardBody>
              <PortalInvite memberId={member.id} defaultEmail={portal.invited?.email ?? member.email ?? ""} />
            </CardBody>
          )}
          {portal.email && <div className="h-5" />}
        </Card>
      )}

      {savingProducts.length > 0 && (
        <Card>
          <CardHeader
            title={modules.includes("payroll") ? "Monthly contributions" : "Usual contributions"}
            description={
              modules.includes("payroll")
                ? `Standing amounts that go on the ${terms.contribution.toLowerCase()} schedule each month.`
                : "Pre-filled on each meeting's collection sheet; change the sheet when a member pays something different."
            }
          />
          <CardBody>
            <ContributionsForm
              memberId={member.id}
              canEdit={hasPermission(ws, "payroll.manage") || hasPermission(ws, "collections.manage")}
              products={savingProducts.map((p) => {
                const c = contributions.find((x) => x.productId === p.id);
                return { id: p.id, name: p.name, amount: c ? (Number(c.amount) / 100).toFixed(2) : "" };
              })}
            />
          </CardBody>
        </Card>
      )}

      {showLoans && (
        <Card>
          <CardHeader
            title="Loans"
            description={loans.length ? `${loans.length} on record` : "No loans yet"}
            actions={
              hasPermission(ws, "loans.prepare") &&
              member.status === "active" && (
                <Link href={`/loans/new?member=${member.id}`} className={buttonClass("secondary", undefined, "sm")}>
                  New application
                </Link>
              )
            }
          />
          {loans.length > 0 && (
            <ul className="divide-border mt-3 divide-y">
              {loans.map((l) => (
                <li key={l.id}>
                  <Link href={`/loans/${l.id}`} className="hover:bg-surface-2 flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <span className="text-accent font-mono text-[13px] font-medium">#{l.loanNo}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {l.productName} · {l.purpose}
                    </span>
                    <span className="font-medium tabular-nums">{formatNaira(l.amount)}</span>
                    <Badge tone={LOAN_STATUS[l.status]!.tone} dot>
                      {LOAN_STATUS[l.status]!.label}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {loans.length === 0 && <div className="h-5" />}
        </Card>
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
