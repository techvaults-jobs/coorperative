"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { submitWithoutReset } from "@/lib/use-form-action";
import type { FormState } from "../actions";
import { requestWithdrawalAction, withdrawalStepAction } from "./actions";

type Option = { id: string; label: string };

export function RequestForm({ members, products }: { members: Option[]; products: Option[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestWithdrawalAction, { ok: false });
  return (
    <form method="post" onSubmit={submitWithoutReset(action)} className="flex flex-col gap-3">
      <Field label="Member" htmlFor="wd-member">
        <Select id="wd-member" name="memberId" required defaultValue="">
          <option value="">Choose a member…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" htmlFor="wd-product">
        <Select id="wd-product" name="productId">
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (₦)" htmlFor="wd-amount" error={state.fieldErrors?.amount}>
        <Input id="wd-amount" name="amount" inputMode="decimal" className="text-right" required />
      </Field>
      <Field label="Reason (optional)" htmlFor="wd-reason">
        <Input id="wd-reason" name="reason" placeholder="e.g. School fees" />
      </Field>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record request"}
      </Button>
    </form>
  );
}

export function StepForm({ id, mode, banks, paidOn, idempotencyKey }: { id: string; mode: "decide" | "pay" | "cancel"; banks?: Option[]; paidOn?: string; idempotencyKey?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(withdrawalStepAction, { ok: false });
  const [rejecting, setRejecting] = useState(false);
  return (
    <form method="post" onSubmit={submitWithoutReset(action)} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      {idempotencyKey && <input type="hidden" name="idempotencyKey" value={idempotencyKey} />}
      {mode === "decide" &&
        (rejecting ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`wd-reason-${id}`} className="sr-only">
              Reason
            </label>
            <Input id={`wd-reason-${id}`} name="reason" placeholder="Reason for declining" autoFocus required />
            <Button type="submit" name="step" value="reject" variant="danger" disabled={pending}>
              Decline
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="submit" name="step" value="approve" disabled={pending}>
              Approve
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRejecting(true)}>
              Decline…
            </Button>
          </div>
        ))}
      {mode === "pay" && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
          <Field label="Paid from" htmlFor={`wd-bank-${id}`}>
            <Select id={`wd-bank-${id}`} name="bankAccountId">
              {banks!.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date paid" htmlFor={`wd-date-${id}`}>
            <Input id={`wd-date-${id}`} name="paidOn" type="date" defaultValue={paidOn} min={paidOn} />
          </Field>
          <Button type="submit" name="step" value="pay" disabled={pending}>
            Prepare payment
          </Button>
        </div>
      )}
      {mode === "cancel" && (
        <div>
          <Button type="submit" name="step" value="cancel" variant="ghost" size="sm" disabled={pending}>
            Cancel request
          </Button>
        </div>
      )}
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
