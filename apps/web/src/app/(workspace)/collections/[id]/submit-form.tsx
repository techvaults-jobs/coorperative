"use client";

import { checkCash, formatNaira, kobo, parseNaira, type Kobo } from "@techvaults/core/browser";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { FormState } from "../../actions";
import { submitSheetAction } from "../actions";

const read = (raw: string): Kobo | null => {
  try {
    return parseNaira(raw.trim() === "" ? "0" : raw);
  } catch {
    return null;
  }
};

/** Cash counted plus transfers must equal the sheet; any difference needs an explanation and goes to suspense. */
export function SubmitSheetForm({ sheetId, recorded, banks, idempotencyKey }: { sheetId: string; recorded: string; banks: { id: string; label: string }[]; idempotencyKey: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitSheetAction, { ok: false });
  const [cash, setCash] = useState("");
  const [transfers, setTransfers] = useState("");
  const c = read(cash);
  const t = read(transfers);
  const check = c !== null && t !== null ? checkCash(kobo(BigInt(recorded)), c, t) : null;
  const entered = cash.trim() !== "" || transfers.trim() !== "";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="sheetId" value={sheetId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cash counted" htmlFor="cashCounted">
          <Input id="cashCounted" name="cashCounted" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0.00" className="tabular-nums" />
        </Field>
        <Field label="Transfers received" htmlFor="transfers" hint="Members who paid by bank transfer for this meeting">
          <Input id="transfers" name="transfers" inputMode="decimal" value={transfers} onChange={(e) => setTransfers(e.target.value)} placeholder="0.00" className="tabular-nums" />
        </Field>
        <Field label="Lodged into" htmlFor="bankAccountId">
          <Select id="bankAccountId" name="bankAccountId">
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Teller no. or transfer reference" htmlFor="lodgementRef">
          <Input id="lodgementRef" name="lodgementRef" autoComplete="off" />
        </Field>
      </div>
      {entered && check && (
        <Alert tone={check.difference === 0n ? "success" : "warning"} title={check.difference === 0n ? "Received matches the sheet." : check.difference > 0n ? `${formatNaira(check.difference)} more than the sheet` : `${formatNaira(kobo(-check.difference))} short of the sheet`}>
          Sheet {formatNaira(check.recorded)} · received {formatNaira(check.received)}
          {check.difference !== 0n && ". The difference is held in suspense (2900) until it's traced; say what happened below."}
        </Alert>
      )}
      {check && check.difference !== 0n && (
        <Field label="Explain the difference" htmlFor="differenceNote">
          <Textarea id="differenceNote" name="differenceNote" rows={2} required placeholder="e.g. Card 14 paid ₦500 not written on the sheet" />
        </Field>
      )}
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <div>
        <Button type="submit" disabled={pending || !check || !entered}>
          {pending ? "Submitting…" : "Submit for posting"}
        </Button>
      </div>
    </form>
  );
}
