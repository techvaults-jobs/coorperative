"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../actions";
import { chargeInterestAction } from "./actions";

export function ChargeInterestForm({ period, idempotencyKey, total, disabled }: { period: string; idempotencyKey: string; total: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(chargeInterestAction, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Button type="submit" disabled={pending || disabled}>
        {pending ? "Submitting…" : `Charge ${total} for approval`}
      </Button>
    </form>
  );
}
