"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { addMember, type FormState } from "../actions";

export function AddMemberForm({ terms }: { terms: { externalId: string; group: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addMember, { ok: false });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  const err = state.fieldErrors ?? {};
  return (
    <form ref={form} action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Member number *" htmlFor="memberNo" error={err.memberNo}>
          <Input id="memberNo" name="memberNo" required aria-invalid={!!err.memberNo} className="font-mono" />
        </Field>
        <Field label="Full name *" htmlFor="fullName" error={err.fullName}>
          <Input id="fullName" name="fullName" required autoComplete="off" aria-invalid={!!err.fullName} />
        </Field>
        <Field label={terms.externalId} htmlFor="staffId" hint="Must be unique. Used to match deductions and remittances.">
          <Input id="staffId" name="staffId" className="font-mono" />
        </Field>
        <Field label={terms.group} htmlFor="department">
          <Input id="department" name="department" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" inputMode="tel" />
        </Field>
        <Field label="Email" htmlFor="email" error={err.email}>
          <Input id="email" name="email" type="email" aria-invalid={!!err.email} />
        </Field>
        <Field label="Date joined" htmlFor="joinedOn" error={err.joinedOn}>
          <Input id="joinedOn" name="joinedOn" type="date" aria-invalid={!!err.joinedOn} />
        </Field>
      </div>
      <div className="border-border flex flex-wrap justify-end gap-2 border-t pt-5">
        <Link href="/members" className={buttonClass("secondary")}>
          Back to register
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add member"}
        </Button>
      </div>
    </form>
  );
}
