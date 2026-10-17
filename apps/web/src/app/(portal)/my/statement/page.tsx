import { getMember, memberStatement, withSociety } from "@techvaults/db";
import { StatementAccounts } from "@/components/member-statement";
import { ReportFrame } from "@/components/report-frame";
import { Field, Input } from "@/components/ui/field";
import { db } from "@/lib/db";
import { financialYearStart, longDate, todayIso, validDate } from "@/lib/periods";
import { requirePortal } from "@/lib/session";
import { requirePortalSociety } from "@/lib/society";

export const metadata = { title: "My statement" };

export default async function MyStatementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await requirePortal();
  const society = await requirePortalSociety();
  const q = await searchParams;
  const to = validDate(q.to, todayIso());
  const from = validDate(q.from, financialYearStart(to, society.financialYearStart));
  const { member, accounts } = await withSociety(db(), me.society.societyId, async (tx) => ({
    member: (await getMember(tx, me.actor, me.memberId))!,
    accounts: await memberStatement(tx, me.actor, me.memberId, from, to),
  }));
  return (
    <ReportFrame
      back={{ href: "/my", label: "Home" }}
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
      <p className="text-muted mb-6 text-sm">
        Member {member.memberNo}
        {member.staffId && ` · ${society.terminology.externalId} ${member.staffId}`}
      </p>
      <StatementAccounts accounts={accounts} from={from} to={to} />
      <p className="text-muted text-xs">If anything looks wrong, tell your society&apos;s secretary within 14 days.</p>
    </ReportFrame>
  );
}
