import { getMember, memberStatement } from "@techvaults/db";
import { notFound } from "next/navigation";
import { StatementAccounts } from "@/components/member-statement";
import { ReportFrame } from "@/components/report-frame";
import { Field, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/page-header";
import { financialYearStart, longDate, todayIso, validDate } from "@/lib/periods";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

export const metadata = { title: "Member statement" };

export default async function MemberStatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read") || !hasPermission(ws, "members.read")) return <EmptyState title="Your role doesn't include member statements." />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const society = await requireSociety();
  const q = await searchParams;
  const to = validDate(q.to, todayIso());
  const from = validDate(q.from, financialYearStart(to, society.financialYearStart));
  const data = await inSociety(ws, async (tx) => {
    const member = await getMember(tx, ws.actor, id);
    return member ? { member, accounts: await memberStatement(tx, ws.actor, id, from, to) } : null;
  });
  if (!data) notFound();
  const { member, accounts } = data;
  return (
    <ReportFrame
      title={`Statement · ${member.fullName}`}
      society={society.name}
      period={`${longDate(from)} to ${longDate(to)}`}
      filters={
        <>
          <Field label="From" htmlFor="from">
            <Input id="from" name="from" type="date" defaultValue={from} />
          </Field>
          <Field label="To" htmlFor="to">
            <Input id="to" name="to" type="date" defaultValue={to} />
          </Field>
        </>
      }
    >
      <dl className="mb-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted text-xs">Member no.</dt>
          <dd className="font-mono">{member.memberNo}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">{society.terminology.externalId}</dt>
          <dd className="font-mono">{member.staffId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">{society.terminology.group}</dt>
          <dd>{member.department ?? "—"}</dd>
        </div>
      </dl>
      <StatementAccounts accounts={accounts} from={from} to={to} />
      <p className="text-muted text-xs">Please report any discrepancy to the society&apos;s secretary within 14 days.</p>
    </ReportFrame>
  );
}
