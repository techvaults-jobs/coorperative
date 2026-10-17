"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { FormState } from "../actions";
import { startRunAction } from "./actions";

export function StartRunForm({ defaultPeriod, strategies }: { defaultPeriod: string; strategies: { value: string; label: string; description: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startRunAction, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Month" htmlFor="period">
        <Input id="period" name="period" type="month" defaultValue={defaultPeriod} required />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-medium">If a member&apos;s deduction falls short</legend>
        {strategies.map((s, i) => (
          <label key={s.value} className="border-border has-[:checked]:border-accent has-[:checked]:bg-accent-soft flex items-start gap-2.5 rounded-lg border p-3 text-sm">
            <input type="radio" name="strategy" value={s.value} defaultChecked={i === 0} className="accent-accent mt-0.5" />
            <span>
              {s.label}
              <span className="text-muted block text-xs">{s.description}</span>
            </span>
          </label>
        ))}
        <p className="text-muted text-xs">Which order societies use is still being confirmed in discovery; this is a provisional choice.</p>
      </fieldset>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Building…" : "Build schedule"}
      </Button>
    </form>
  );
}
