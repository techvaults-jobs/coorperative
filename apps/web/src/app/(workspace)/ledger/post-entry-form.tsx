"use client";

import { Plus, X } from "lucide-react";
import { submitWithoutReset } from "@/lib/use-form-action";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, Input, Select } from "@/components/ui/field";
import { submitEntry, type FormState } from "../actions";

type Option = { id: string; label: string };
type Row = { key: number; accountId: string; memberId: string; debit: string; credit: string };

let nextKey = 0;
const blank = (): Row => ({ key: nextKey++, accountId: "", memberId: "", debit: "", credit: "" });

/** Kobo from what's typed, for the running totals only; the server re-parses exactly. */
const kobo = (s: string) => {
  const n = Number(s.replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A journal entry of as many lines as it needs. Debits must equal credits; member accounts
 * ask for the member. After a successful submission the page re-renders with a fresh
 * idempotency key, so a double click or retry can't submit twice.
 */
export function PostEntryForm({
  idempotencyKey,
  today,
  accounts,
  members,
}: {
  idempotencyKey: string;
  today: string;
  accounts: (Option & { memberControl: boolean })[];
  members: Option[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitEntry, { ok: false });
  const [rows, setRows] = useState<Row[]>(() => [blank(), blank()]);
  const form = useRef<HTMLFormElement>(null);
  // Clear the form only after a successful submission; after an error, keep what was typed.
  useEffect(() => {
    if (!state.ok) return;
    form.current?.reset();
    setRows([blank(), blank()]);
  }, [state]);
  const err = state.fieldErrors ?? {};
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const debit = rows.reduce((s, r) => s + kobo(r.debit), 0);
  const credit = rows.reduce((s, r) => s + kobo(r.credit), 0);
  const balanced = debit > 0 && debit === credit;
  const isControl = (id: string) => accounts.some((a) => a.id === id && a.memberControl);

  return (
    <form ref={form} method="post" onSubmit={submitWithoutReset(action)} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Field label="Accounting date" htmlFor="entryDate" error={err.entryDate}>
          <Input id="entryDate" name="entryDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="Description" htmlFor="description" error={err.description} hint="e.g. October payroll remittance, or Transfer to savings account with charges">
          <Input id="description" name="description" required aria-invalid={!!err.description} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium">Lines</legend>
        <div className="text-muted hidden grid-cols-[minmax(0,1fr)_130px_130px_36px] gap-2 px-1 text-[11px] font-semibold tracking-wider uppercase sm:grid">
          <span>Account</span>
          <span className="text-right">Debit (₦)</span>
          <span className="text-right">Credit (₦)</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={r.key} className="border-border flex flex-col gap-2 rounded-lg border p-2 sm:border-0 sm:p-0">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_130px_130px_36px]">
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor={`line-${i}-account`} className="sr-only">
                  Account, line {i + 1}
                </label>
                <Select id={`line-${i}-account`} name="accountId" value={r.accountId} onChange={(e) => update(r.key, { accountId: e.target.value, memberId: "" })}>
                  <option value="">Choose account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor={`line-${i}-debit`} className="sr-only">
                  Debit, line {i + 1}
                </label>
                <Input
                  id={`line-${i}-debit`}
                  name="debit"
                  inputMode="decimal"
                  placeholder="Debit"
                  value={r.debit}
                  onChange={(e) => update(r.key, { debit: e.target.value, ...(e.target.value ? { credit: "" } : {}) })}
                  className="text-right"
                />
              </div>
              <div>
                <label htmlFor={`line-${i}-credit`} className="sr-only">
                  Credit, line {i + 1}
                </label>
                <Input
                  id={`line-${i}-credit`}
                  name="credit"
                  inputMode="decimal"
                  placeholder="Credit"
                  value={r.credit}
                  onChange={(e) => update(r.key, { credit: e.target.value, ...(e.target.value ? { debit: "" } : {}) })}
                  className="text-right"
                />
              </div>
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                disabled={rows.length <= 2}
                aria-label={`Remove line ${i + 1}`}
                className="text-muted hover:bg-surface-2 hover:text-foreground col-span-2 flex h-10 items-center justify-center rounded-lg disabled:opacity-30 sm:col-span-1"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {isControl(r.accountId) ? (
              <div className="sm:pr-[312px]">
                <label htmlFor={`line-${i}-member`} className="sr-only">
                  Member, line {i + 1}
                </label>
                <Select id={`line-${i}-member`} name="memberId" value={r.memberId} onChange={(e) => update(r.key, { memberId: e.target.value })} className="text-[13px]">
                  <option value="">Choose the member…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <input type="hidden" name="memberId" value="" />
            )}
            {err[`line-${i}`] && (
              <p className="text-danger text-xs" role="alert">
                {err[`line-${i}`]}
              </p>
            )}
          </div>
        ))}
        <div className="border-border mt-1 grid grid-cols-2 items-center gap-2 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_130px_130px_36px]">
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, blank()])} className="w-fit">
            <Plus className="size-4" aria-hidden />
            Add line
          </Button>
          <span className="hidden sm:block" />
          <span className="text-right text-sm font-semibold tabular-nums">{naira(debit)}</span>
          <span className="text-right text-sm font-semibold tabular-nums">{naira(credit)}</span>
        </div>
        <p role="status" className={cn("text-right text-xs font-medium", balanced ? "text-success" : "text-muted")}>
          {balanced ? "✓ Balanced" : debit || credit ? `Out by ${naira(Math.abs(debit - credit))}` : "Debits must equal credits"}
        </p>
        {err.lines && (
          <p className="text-danger text-xs" role="alert">
            {err.lines}
          </p>
        )}
      </fieldset>

      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit for approval"}
        </Button>
      </div>
    </form>
  );
}
