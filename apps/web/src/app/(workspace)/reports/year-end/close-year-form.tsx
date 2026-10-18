"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../actions";
import { closeYearAction } from "./actions";

export function CloseYearForm({ start, end, disabled }: { start: string; end: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(closeYearAction, { ok: false });
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="end" value={end} />
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Button type="submit" disabled={pending || disabled}>
        {pending ? "Preparing…" : "Prepare closing entry"}
      </Button>
    </form>
  );
}
