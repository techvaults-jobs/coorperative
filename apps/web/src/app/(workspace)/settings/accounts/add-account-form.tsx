"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { FormState } from "../../actions";
import { addAccount } from "../actions";

export function AddAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addAccount, { ok: false });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-[100px_1fr] gap-3">
        <Field label="Code" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" required className="font-mono" placeholder="2150" />
        </Field>
        <Field label="Type" htmlFor="class">
          <Select id="class" name="class" defaultValue="liability">
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
            <option value="equity">Equity</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </Select>
        </Field>
      </div>
      <Field label="Name" htmlFor="account-name">
        <Input id="account-name" name="name" required placeholder="e.g. Members' special savings" />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isMemberControl" value="1" className="accent-accent mt-0.5 size-4" />
        <span>
          Holds individual member balances
          <span className="text-muted block text-xs">Every entry line must then name a member.</span>
        </span>
      </label>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add account"}
      </Button>
    </form>
  );
}
