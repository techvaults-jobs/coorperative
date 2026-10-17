import { formatNaira } from "@techvaults/core";
import { getMember, memberStatement } from "@techvaults/db";
import { notFound } from "next/navigation";
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
      {accounts.length === 0 && <p className="text-muted text-sm">No transactions up to {longDate(to)}.</p>}
      {accounts.map((a) => (
        <section key={a.code} className="mb-8 break-inside-avoid">
          <div className="border-border mb-1 flex items-baseline justify-between border-b pb-1.5">
            <h3 className="text-sm font-semibold">{a.name}</h3>
            <p className="text-sm tabular-nums">
              Closing balance <span className="font-semibold">{formatNaira(a.closing)}</span>
            </p>
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted text-left text-xs">
                <th className="w-28 py-1.5 font-medium">Date</th>
                <th className="py-1.5 font-medium">Details</th>
                <th className="w-32 py-1.5 text-right font-medium">Debit</th>
                <th className="w-32 py-1.5 text-right font-medium">Credit</th>
                <th className="w-36 py-1.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-border/60 border-t">
                <td className="py-1.5">{from}</td>
                <td className="text-muted py-1.5">Opening balance</td>
                <td />
                <td />
                <td className="py-1.5 text-right">{formatNaira(a.opening)}</td>
              </tr>
              {a.lines.map((l, i) => (
                <tr key={i} className="border-border/60 border-t">
                  <td className="py-1.5">{l.date}</td>
                  <td className="py-1.5">
                    <span className="text-subtle mr-1.5 font-mono text-xs">#{l.entryNo.toString()}</span>
                    {l.description}
                  </td>
                  <td className="py-1.5 text-right">{l.debit ? formatNaira(l.debit) : ""}</td>
                  <td className="py-1.5 text-right">{l.credit ? formatNaira(l.credit) : ""}</td>
                  <td className="py-1.5 text-right">{formatNaira(l.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="text-muted text-xs">Please report any discrepancy to the society&apos;s secretary within 14 days.</p>
    </ReportFrame>
  );
}
