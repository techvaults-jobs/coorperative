"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { runStepAction, type ImportState } from "../actions";

export function RunStepForm({
  runId,
  step,
  label,
  variant = "primary",
  upload,
  banks,
  idempotencyKey,
}: {
  runId: string;
  step: "issue" | "rebuild" | "import" | "submit";
  label: string;
  variant?: "primary" | "secondary";
  upload?: boolean;
  banks?: { id: string; label: string }[];
  idempotencyKey?: string;
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(runStepAction, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="step" value={step} />
      {idempotencyKey && <input type="hidden" name="idempotencyKey" value={idempotencyKey} />}
      {upload && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
          <Field label="Employer's file" htmlFor={`file-${step}`} hint="CSV. Or paste its contents below.">
            <Input id={`file-${step}`} name="file" type="file" accept=".csv,text/csv" className="py-1.5" />
          </Field>
          <Field label="Received on" htmlFor="receivedOn">
            <Input id="receivedOn" name="receivedOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </Field>
          <Field label="Or paste the file" htmlFor="csv" className="lg:col-span-2">
            <Textarea id="csv" name="csv" rows={3} placeholder={"Staff ID,Name,Amount\nDS/1001,Adaeze Okonkwo,20000.00"} className="font-mono text-xs" />
          </Field>
        </div>
      )}
      {banks && (
        <Field label="Paid into" htmlFor="bankAccountId">
          <Select id="bankAccountId" name="bankAccountId">
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {state.message && (
        <Alert tone="danger" title={state.message}>
          {state.errors && (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {state.errors.map((e) => (
                <li key={e.line}>
                  Line {e.line}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      <div>
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? "Working…" : label}
        </Button>
      </div>
    </form>
  );
}
