import { formatNaira } from "@techvaults/core";
import type { MemberStatementAccount } from "@techvaults/db";
import { longDate } from "@/lib/periods";

/** A member's statement accounts: opening balance, movements with running balance, closing balance. */
export function StatementAccounts({ accounts, from, to }: { accounts: MemberStatementAccount[]; from: string; to: string }) {
  return (
    <>
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
    </>
  );
}
