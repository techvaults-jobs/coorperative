"use client";

import { formatNaira, kobo, parseNaira, type Kobo } from "@techvaults/core/browser";
import { useActionState, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { saveSheetAction, type SaveState } from "../actions";

export interface GridColumn {
  key: string;
  label: string;
  loan: boolean;
}

export interface GridRow {
  memberId: string;
  memberNo: string;
  name: string;
  /** Naira strings per column key, e.g. "5000.00". */
  values: Record<string, string>;
  loan: { loanNo: number; outstanding: string; interestDue: string } | null;
}

function toKobo(raw: string | undefined): Kobo | null {
  if (!raw || raw.trim() === "") return kobo(0);
  try {
    return parseNaira(raw);
  } catch {
    return null;
  }
}

/**
 * The meeting's sheet, laid out like the paper one: card no., name, one column per scheme, then
 * loan repayment and interest. Enter moves down a column; pasting a block from Excel fills cells
 * to the right and below; "Go to card" jumps to a member.
 */
export function SheetGrid({ sheetId, columns, rows }: { sheetId: string; columns: GridColumn[]; rows: GridRow[] }) {
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(rows.map((r) => [r.memberId, { ...r.values }])));
  const [dirty, setDirty] = useState(false);
  const [state, action, pending] = useActionState<SaveState, FormData>(async (prev, fd) => {
    const result = await saveSheetAction(prev, fd);
    if (result.ok) setDirty(false);
    return result;
  }, { ok: false });
  const [jump, setJump] = useState("");
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const cellId = (r: number, c: number) => `${r}:${c}`;

  const set = (memberId: string, key: string, value: string) => {
    setDirty(true);
    setValues((v) => ({ ...v, [memberId]: { ...v[memberId], [key]: value } }));
  };

  const totals = useMemo(() => {
    const byColumn: Record<string, bigint> = {};
    let all = 0n;
    let invalid = 0;
    for (const r of rows) {
      for (const c of columns) {
        const k = toKobo(values[r.memberId]?.[c.key]);
        if (k === null) {
          invalid++;
          continue;
        }
        byColumn[c.key] = (byColumn[c.key] ?? 0n) + k;
        all += k;
      }
    }
    return { byColumn, all: kobo(all), invalid };
  }, [values, rows, columns]);

  const focus = (r: number, c: number) => {
    const el = inputs.current.get(cellId(r, c));
    if (el) {
      el.focus();
      el.select();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focus(e.shiftKey ? r - 1 : r + 1, c);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focus(r - 1, c);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    setDirty(true);
    const block = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    setValues((v) => {
      const next = { ...v };
      block.forEach((cells, dr) => {
        const row = rows[r + dr];
        if (!row) return;
        next[row.memberId] = { ...next[row.memberId] };
        cells.forEach((cell, dc) => {
          const col = columns[c + dc];
          if (!col || (col.loan && !row.loan)) return;
          next[row.memberId]![col.key] = cell.trim();
        });
      });
      return next;
    });
  };

  const goToCard = (e: React.FormEvent) => {
    e.preventDefault();
    const r = rows.findIndex((row) => row.memberNo.toLowerCase() === jump.trim().toLowerCase());
    if (r >= 0) {
      focus(r, 0);
      setJump("");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form onSubmit={goToCard} className="flex items-end gap-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="jump">
            Go to card no.
            <Input id="jump" value={jump} onChange={(e) => setJump(e.target.value)} className="w-28" inputMode="numeric" autoComplete="off" />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Go
          </Button>
        </form>
        <p className="text-muted text-xs">Enter moves down a column · paste a block from Excel to fill several cells</p>
      </div>

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="sheetId" value={sheetId} />
        <div className="border-border bg-surface max-h-[70vh] overflow-auto rounded-xl border shadow-sm">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-surface-2 sticky top-0 z-10">
              <tr>
                <th scope="col" className="border-border text-muted sticky left-0 z-20 border-b bg-inherit px-3 py-2 text-left text-xs font-medium">
                  Card
                </th>
                <th scope="col" className="border-border text-muted border-b px-3 py-2 text-left text-xs font-medium">
                  Name
                </th>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className="border-border text-muted border-b px-2 py-2 text-right text-xs font-medium whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                <th scope="col" className="border-border text-muted border-b px-3 py-2 text-right text-xs font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => {
                let rowTotal = 0n;
                return (
                  <tr key={row.memberId} className="hover:bg-surface-2 focus-within:bg-accent-soft/50 transition-colors">
                    <td className="border-border bg-surface sticky left-0 border-b px-3 py-1 font-mono text-[13px] tabular-nums">{row.memberNo}</td>
                    <td className="border-border min-w-40 border-b px-3 py-1">
                      <span className="block truncate">{row.name}</span>
                      {row.loan && (
                        <span className="text-muted block text-[11px]">
                          Loan #{row.loan.loanNo} · {row.loan.outstanding} outstanding{row.loan.interestDue !== "₦0.00" && ` · interest due ${row.loan.interestDue}`}
                        </span>
                      )}
                    </td>
                    {columns.map((c, ci) => {
                      const raw = values[row.memberId]?.[c.key] ?? "";
                      const k = toKobo(raw);
                      if (k !== null) rowTotal += k;
                      const disabled = c.loan && !row.loan;
                      return (
                        <td key={c.key} className="border-border border-b px-1 py-1">
                          <input
                            ref={(el) => {
                              if (el) inputs.current.set(cellId(r, ci), el);
                              else inputs.current.delete(cellId(r, ci));
                            }}
                            name={raw.trim() && !disabled ? `a:${row.memberId}:${c.key}` : undefined}
                            value={disabled ? "" : raw}
                            disabled={disabled}
                            onChange={(e) => set(row.memberId, c.key, e.target.value)}
                            onKeyDown={(e) => onKeyDown(e, r, ci)}
                            onPaste={(e) => onPaste(e, r, ci)}
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={`${c.label}, card ${row.memberNo}`}
                            aria-invalid={k === null || undefined}
                            placeholder={disabled ? "—" : ""}
                            className={cn(
                              "focus:border-accent focus:ring-accent/30 w-24 rounded-md border border-transparent bg-transparent px-2 py-1 text-right tabular-nums outline-none focus:ring-2",
                              "disabled:cursor-not-allowed disabled:opacity-40",
                              k === null && "border-danger bg-danger-soft",
                            )}
                          />
                        </td>
                      );
                    })}
                    <td className="border-border border-b px-3 py-1 text-right font-medium tabular-nums">{rowTotal ? formatNaira(kobo(rowTotal)) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-2 sticky bottom-0">
              <tr>
                <td className="border-border sticky left-0 border-t bg-inherit px-3 py-2 text-xs font-semibold" colSpan={2}>
                  Totals
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="border-border border-t px-3 py-2 text-right text-xs font-semibold tabular-nums">
                    {formatNaira(kobo(totals.byColumn[c.key] ?? 0n))}
                  </td>
                ))}
                <td className="border-border border-t px-3 py-2 text-right font-semibold tabular-nums">{formatNaira(totals.all)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {totals.invalid > 0 && <Alert tone="danger">{totals.invalid === 1 ? "One amount isn't" : `${totals.invalid} amounts aren't`} a valid naira amount. Use figures like 5000 or 5,000.50.</Alert>}
        {state.message && (
          <Alert tone={state.ok ? "success" : "danger"} title={state.message}>
            {state.problems && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {state.problems.map((p, i) => (
                  <li key={i}>
                    Card {p.memberNo}: {p.message}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || totals.invalid > 0}>
            {pending ? "Saving…" : "Save sheet"}
          </Button>
          {dirty && <span className="text-warning text-xs font-medium">Unsaved changes</span>}
        </div>
      </form>
    </div>
  );
}
