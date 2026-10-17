import { formatNaira, type Kobo } from "@techvaults/core";

export interface EntryLine {
  accountCode: string;
  accountName: string;
  memberNo: string | null;
  memberName: string | null;
  side: "debit" | "credit";
  amount: Kobo;
}

export function entryTotal(lines: readonly EntryLine[]): Kobo {
  return lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0n) as Kobo;
}

/** Lines of a journal entry: debits flush left, credits indented, amounts in their own columns. */
export function EntryLines({ lines }: { lines: readonly EntryLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full text-sm">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-border border-t">
              <td className={`py-1.5 pr-3 ${l.side === "credit" ? "pl-6" : ""}`}>
                <span className="text-muted mr-2 font-mono text-xs">{l.accountCode}</span>
                {l.accountName}
                {l.memberName && (
                  <span className="text-muted">
                    {" "}
                    · {l.memberNo} {l.memberName}
                  </span>
                )}
              </td>
              <td className="w-32 py-1.5 text-right font-mono">{l.side === "debit" ? formatNaira(l.amount, { symbol: false }) : ""}</td>
              <td className="w-32 py-1.5 text-right font-mono">{l.side === "credit" ? formatNaira(l.amount, { symbol: false }) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
