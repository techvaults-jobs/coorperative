"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { reverseEntry, type FormState } from "../actions";

export function ReverseEntryForm({ entryId, idempotencyKey }: { entryId: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reverseEntry, { ok: false });
  return (
    <details className="text-sm">
      <summary className="text-muted hover:text-foreground w-fit cursor-pointer">Reverse this entry</summary>
      <p className="text-muted mt-2 text-xs">The reversal is posted when another officer approves it. This entry is never changed.</p>
      <form action={action} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <label htmlFor={`reason-${entryId}`} className="sr-only">
          Reason for reversal
        </label>
        <Input id={`reason-${entryId}`} name="reason" placeholder="Reason, e.g. posted to the wrong member" required />
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Requesting…" : "Request reversal"}
        </Button>
      </form>
      {(state.message || state.fieldErrors?.reason) && (
        <p role="status" className={`mt-1 ${state.ok ? "text-accent" : "text-danger"}`}>
          {state.message ?? state.fieldErrors?.reason}
        </p>
      )}
    </details>
  );
}
