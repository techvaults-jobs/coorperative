import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClass } from "./ui/button";
import { Card } from "./ui/card";
import { PageHeader } from "./ui/page-header";
import { PrintButton } from "./print-button";

/**
 * A report page: filters (a GET form, so every view has a shareable URL), print and CSV, and a
 * letterhead that appears on paper.
 */
export function ReportFrame({
  title,
  society,
  period,
  filters,
  csvHref,
  back = { href: "/reports", label: "Reports" },
  children,
}: {
  back?: { href: string; label: string };
  title: string;
  society: string;
  period: string;
  filters?: ReactNode;
  csvHref?: string;
  children: ReactNode;
}) {
  const generated = new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });
  return (
    <>
      <div data-print-hide>
        <PageHeader
          back={back}
          title={title}
          description={period}
          actions={
            <>
              {csvHref && (
                <a href={csvHref} className={buttonClass("secondary")} download>
                  <Download className="size-4" aria-hidden />
                  CSV
                </a>
              )}
              <PrintButton />
            </>
          }
        />
      </div>
      {filters && (
        <form method="get" data-print-hide className="border-border bg-surface flex flex-wrap items-end gap-3 rounded-xl border p-4 shadow-sm">
          {filters}
          <button type="submit" className={buttonClass("secondary")}>
            Update
          </button>
        </form>
      )}
      <Card className="print:border-0 print:shadow-none">
        <div className="border-border flex flex-wrap items-end justify-between gap-2 border-b px-6 py-5">
          <div>
            <p className="text-muted text-xs font-semibold tracking-wider uppercase">{society}</p>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="text-muted text-sm">{period}</p>
          </div>
          <p className="text-muted text-xs">Generated {generated} · Cooperative Vaults</p>
        </div>
        <div className="px-6 py-5">{children}</div>
      </Card>
    </>
  );
}

/** Report sections: a heading row then lines, with an optional total. */
export function ReportSection({ title, rows, total, totalLabel }: { title: string; rows: { label: ReactNode; amount: string; sub?: boolean }[]; total?: string; totalLabel?: string }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h3 className="text-muted border-border mb-1 border-b pb-1.5 text-xs font-semibold tracking-wider uppercase">{title}</h3>
      <table className="w-full text-sm tabular-nums">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-border/60 border-b last:border-0">
              <td className={r.sub ? "text-muted py-1.5 pl-4" : "py-1.5"}>{r.label}</td>
              <td className="w-40 py-1.5 text-right">{r.amount}</td>
            </tr>
          ))}
          {total !== undefined && (
            <tr className="font-semibold">
              <td className="border-foreground border-t py-2">{totalLabel ?? `Total ${title.toLowerCase()}`}</td>
              <td className="border-foreground border-t py-2 text-right">{total}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
