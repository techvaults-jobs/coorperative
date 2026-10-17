"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { inviteOfficerAction, type InviteState } from "../actions";
import { RoleCheckboxes, type RoleOption } from "./role-checkboxes";

export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteOfficerAction, { ok: false });
  const [copied, setCopied] = useState(false);
  const err = state.fieldErrors ?? {};

  if (state.ok && state.link) {
    return (
      <div className="flex flex-col gap-3 text-sm" role="status">
        <p className="text-accent font-medium">Invitation created for {state.email}.</p>
        <p className="text-muted text-xs">
          Send this link to them privately, for example by WhatsApp or email. Anyone with the link can accept it, and it can&apos;t be
          shown again.
        </p>
        <label htmlFor="invite-link" className="sr-only">
          Invitation link
        </label>
        <Input id="invite-link" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
            Invite someone else
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Email" htmlFor="invite-email" error={err.email}>
        <Input id="invite-email" name="email" type="email" autoComplete="off" required aria-invalid={!!err.email} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <RoleCheckboxes roles={roles} idPrefix="invite" />
        {err.roles && (
          <p className="text-danger text-xs" role="alert">
            {err.roles}
          </p>
        )}
      </div>
      {state.message && (
        <p role="alert" className="text-danger text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create invitation link"}
      </Button>
    </form>
  );
}
