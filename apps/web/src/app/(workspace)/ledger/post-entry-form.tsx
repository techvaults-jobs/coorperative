"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { submitEntry, type FormState } from "../actions";

type Option = { id: string; label: string };

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
  const [debit, setDebit] = useState("");
  const [credit, setCredit] = useState("");
  const needsMember = accounts.some((a) => (a.id === debit || a.id === credit) && a.memberControl);
  const err = state.fieldErrors ?? {};

  // After a successful submission the page re-renders with a fresh idempotency key, so the
  // same entry can't be submitted twice by a double click or a retry.
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Field label="Accounting date" htmlFor="entryDate" error={err.entryDate}>
        <Input id="entryDate" name="entryDate" type="date" defaultValue={today} required />
      </Field>
      <Field label="Description" htmlFor="description" error={err.description} hint="e.g. October payroll remittance – savings">
        <Input id="description" name="description" required aria-invalid={!!err.description} />
      </Field>
      <Field label="Debit account" htmlFor="debitAccountId" error={err.debitAccountId}>
        <Select id="debitAccountId" name="debitAccountId" value={debit} onChange={(e) => setDebit(e.target.value)} required>
          <option value="">Choose…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Credit account" htmlFor="creditAccountId" error={err.creditAccountId}>
        <Select id="creditAccountId" name="creditAccountId" value={credit} onChange={(e) => setCredit(e.target.value)} required>
          <option value="">Choose…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      {needsMember && (
        <Field label="Member" htmlFor="memberId" hint="Required because a member account is involved.">
          <Select id="memberId" name="memberId" required>
            <option value="">Choose…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Amount (₦)" htmlFor="amount" error={err.amount}>
        <Input id="amount" name="amount" inputMode="decimal" placeholder="0.00" required aria-invalid={!!err.amount} className="text-right font-mono" />
      </Field>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit for approval"}
      </Button>
    </form>
  );
}
