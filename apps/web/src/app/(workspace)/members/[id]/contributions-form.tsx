"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { FormState } from "../../actions";
import { setContributionAction } from "../../payroll/actions";

export function ContributionsForm({ memberId, products, canEdit }: { memberId: string; products: { id: string; name: string; amount: string }[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setContributionAction, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="memberId" value={memberId} />
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        {products.map((p) => (
          <Field key={p.id} label={`${p.name} (₦ a month)`} htmlFor={`amount-${p.id}`}>
            <Input id={`amount-${p.id}`} name={`amount:${p.id}`} inputMode="decimal" defaultValue={p.amount} placeholder="0.00" className="text-right" />
          </Field>
        ))}
      </fieldset>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      {canEdit && (
        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save contributions"}
          </Button>
        </div>
      )}
    </form>
  );
}
