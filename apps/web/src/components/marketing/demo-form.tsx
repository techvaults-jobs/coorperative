"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { requestDemo, type DemoState } from "@/app/demo-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function DemoForm() {
  const [state, action, pending] = useActionState<DemoState, FormData>(requestDemo, { ok: false });
  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
        <span className="bg-success-soft text-success flex size-12 items-center justify-center rounded-full">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <p className="text-lg font-semibold">Request received</p>
        <p className="text-muted max-w-sm text-sm">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <Field label="Your name" htmlFor="demo-name">
        <Input id="demo-name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Your role" htmlFor="demo-role">
        <Input id="demo-role" name="role" placeholder="e.g. Secretary, Treasurer" />
      </Field>
      <Field label="Society name" htmlFor="demo-society" className="sm:col-span-2">
        <Input id="demo-society" name="society" required />
      </Field>
      <Field label="Email" htmlFor="demo-email">
        <Input id="demo-email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Phone (optional)" htmlFor="demo-phone">
        <Input id="demo-phone" name="phone" type="tel" autoComplete="tel" />
      </Field>
      <Field label="Type of society" htmlFor="demo-sector">
        <Select id="demo-sector" name="sector" defaultValue="">
          <option value="">Choose…</option>
          <option>Staff / workplace</option>
          <option>Agricultural</option>
          <option>Transport</option>
          <option>Market / traders</option>
          <option>Multipurpose</option>
          <option>Thrift & credit</option>
          <option>Housing</option>
          <option>Other</option>
        </Select>
      </Field>
      <Field label="Number of members" htmlFor="demo-members">
        <Select id="demo-members" name="members" defaultValue="">
          <option value="">Choose…</option>
          <option>Under 100</option>
          <option>100–500</option>
          <option>500–2,000</option>
          <option>2,000–10,000</option>
          <option>Over 10,000</option>
        </Select>
      </Field>
      <Field label="Anything we should know? (optional)" htmlFor="demo-message" className="sm:col-span-2">
        <Textarea id="demo-message" name="message" rows={3} placeholder="How you keep records today, what you'd like to improve…" />
      </Field>
      {state.message && <Alert tone="danger" className="sm:col-span-2">{state.message}</Alert>}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Request a demo"}
        </Button>
        <p className="text-muted text-center text-xs">We use these details only to arrange your demo.</p>
      </div>
    </form>
  );
}
