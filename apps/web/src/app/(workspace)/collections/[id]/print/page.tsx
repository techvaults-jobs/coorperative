import { formatNaira, kobo } from "@techvaults/core";
import { collectionSheet } from "@techvaults/db";
import { notFound } from "next/navigation";
import { ReportFrame } from "@/components/report-frame";
import { EmptyState } from "@/components/ui/page-header";
import { meetingLabel } from "@/lib/collection-status";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

export const metadata = { title: "Collection sheet" };

/**
 * The paper sheet for the meeting, in the workbook's layout (card no., name, then the money
 * columns). Before posting, each member's expected amount is printed small as a guide and the
 * box is left for what they actually pay; afterwards it shows what was posted.
 */
export default async function PrintCollectionSheet({ params }: { params: Promise<{ id: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "collections.manage") && !hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include collections." />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const society = await requireSociety();
  const sheet = await inSociety(ws, (tx) => collectionSheet(tx, ws.actor, id));
  if (!sheet) notFound();
  const blank = sheet.status === "draft";

  return (
    <ReportFrame
      back={{ href: `/collections/${sheet.id}`, label: "Back to the sheet" }}
      title={blank ? "Weekly contributions record" : "Collections posted"}
      society={society.name}
      period={`Meeting of ${meetingLabel(sheet.meetingDate)}`}
    >
      {blank && <p className="text-muted mb-3 text-xs">Small figures are each member&apos;s usual amount or what&apos;s due on their loan. Write what they actually pay in the box.</p>}
      <table className="w-full border-collapse text-[12px] tabular-nums">
        <thead>
          <tr className="border-foreground border-b-2 text-left">
            <th className="py-1.5 pr-2">Card</th>
            <th className="py-1.5 pr-2">Name</th>
            {sheet.columns.map((c) => (
              <th key={c.key} className="px-1 py-1.5 text-right">
                {c.label}
              </th>
            ))}
            <th className="py-1.5 pl-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((r) => (
            <tr key={r.memberId} className="border-border break-inside-avoid border-b">
              <td className="py-2 pr-2 font-mono">{r.memberNo}</td>
              <td className="py-2 pr-2">{r.name}</td>
              {sheet.columns.map((c) => {
                const v = r.amounts[c.key];
                const noLoan = (c.kind === "loan" || c.kind === "interest") && !r.loan;
                return (
                  <td key={c.key} className="px-1 py-1 text-right align-top">
                    {blank ? (
                      noLoan ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <span className="border-border-strong flex h-7 min-w-20 items-start justify-end rounded border px-1 text-[9px] text-subtle">{v ? formatNaira(v, { symbol: false }) : ""}</span>
                      )
                    ) : v ? (
                      formatNaira(v, { symbol: false })
                    ) : (
                      ""
                    )}
                  </td>
                );
              })}
              <td className="py-2 pl-2 text-right font-medium">{blank ? "" : formatNaira(r.total, { symbol: false })}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-foreground border-t-2 font-semibold">
            <td className="py-2" colSpan={2}>
              Totals
            </td>
            {sheet.columns.map((c) => (
              <td key={c.key} className="px-1 py-2 text-right">
                {blank ? "" : formatNaira(sheet.totals[c.key] ?? kobo(0), { symbol: false })}
              </td>
            ))}
            <td className="py-2 pl-2 text-right">{blank ? "" : formatNaira(sheet.total, { symbol: false })}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-8 grid grid-cols-2 gap-x-10 gap-y-6 text-xs sm:grid-cols-4">
        {["Cash counted", "Transfers", "Collected by (name & signature)", "Received by treasurer (signature)"].map((label) => (
          <div key={label}>
            <div className="border-foreground h-8 border-b" />
            <p className="text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>
    </ReportFrame>
  );
}
