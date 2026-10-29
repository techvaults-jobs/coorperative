"use client";

import { WEEKDAYS } from "@techvaults/core/browser";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { FormState } from "../actions";
import { meetingDayAction, openSheetAction } from "./actions";

export function OpenSheetForm({ defaultDate, max }: { defaultDate: string; max: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(openSheetAction, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Meeting date" htmlFor="meetingDate">
        <Input id="meetingDate" name="meetingDate" type="date" defaultValue={defaultDate} max={max} required />
      </Field>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Opening…" : "Open sheet"}
      </Button>
    </form>
  );
}

export function MeetingDayForm({ current }: { current: number | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(meetingDayAction, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Meetings are held on" htmlFor="weekday">
        <Select id="weekday" name="weekday" defaultValue={current === null ? "" : String(current)}>
          <option value="">Any day</option>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </Select>
      </Field>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
