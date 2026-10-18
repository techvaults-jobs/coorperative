"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { submitWithoutReset } from "@/lib/use-form-action";
import { requestOwnWithdrawal, type MemberApplyState } from "../actions";

export function WithdrawForm({ products }: { products: { id: string; label: string; note: string }[] }) {
  const [state, action, pending] = useActionState<MemberApplyState, FormData>(requestOwnWithdrawal, { ok: false });
  const [productId, setProductId] = useState(products[0]!.id);
  const note = products.find((p) => p.id === productId)?.note;
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form method="post" onSubmit={submitWithoutReset(action)} className="flex flex-col gap-4">
      <Field label="From" htmlFor="productId" hint={note}>
        <Select id="productId" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (₦)" htmlFor="amount">
        <Input id="amount" name="amount" inputMode="decimal" className="text-right" required />
      </Field>
      <Field label="What is it for? (optional)" htmlFor="reason">
        <Input id="reason" name="reason" />
      </Field>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}
