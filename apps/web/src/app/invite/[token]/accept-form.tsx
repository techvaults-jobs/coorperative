"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { acceptAsNewOfficer, acceptAsSignedInOfficer, type AcceptState } from "../actions";

export function AcceptForm({ token, mode, email }: { token: string; mode: "new" | "existing"; email?: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(mode === "new" ? acceptAsNewOfficer : acceptAsSignedInOfficer, {
    ok: false,
  });
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {mode === "new" && (
        <>
          {/* Lets password managers save the login against the right email. */}
          <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
          <Field label="Full name" htmlFor="name" error={err.name}>
            <Input id="name" name="name" autoComplete="name" defaultValue={state.name} required aria-invalid={!!err.name} />
          </Field>
          <Field label="Password" htmlFor="password" error={err.password} hint="At least 12 characters. A short phrase is easier to remember.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={!!err.password} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={err.confirm}>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={!!err.confirm} />
          </Field>
          <p className="text-muted text-xs">Next, you&apos;ll set up an authenticator app. Officers need it to open society records.</p>
        </>
      )}
      {state.message && (
        <p role="alert" className="text-danger text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : mode === "new" ? "Create account and join" : "Join society"}
      </Button>
    </form>
  );
}
