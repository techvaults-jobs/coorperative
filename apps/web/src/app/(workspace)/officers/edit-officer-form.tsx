"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { updateOfficerAction, type FormState } from "../actions";
import { RoleCheckboxes, type RoleOption } from "./role-checkboxes";

export function EditOfficerForm({ userId, name, current, roles }: { userId: string; name: string; current: string[]; roles: RoleOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateOfficerAction, { ok: false });
  return (
    <details className="mt-2 text-sm">
      <summary className="text-muted hover:text-foreground w-fit cursor-pointer text-xs">Change roles or remove</summary>
      <form action={action} className="mt-3 flex max-w-sm flex-col gap-3">
        <input type="hidden" name="userId" value={userId} />
        <RoleCheckboxes roles={roles} selected={current} idPrefix={`edit-${userId}`} />
        <Field label="Reason" htmlFor={`reason-${userId}`} error={state.fieldErrors?.reason} hint="Recorded in the audit trail.">
          <Input id={`reason-${userId}`} name="reason" placeholder="e.g. Elected treasurer at the AGM" required />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="update" disabled={pending}>
            Save roles
          </Button>
          <Button type="submit" name="intent" value="remove" variant="danger" disabled={pending} aria-label={`Remove ${name}'s access`}>
            Remove access
          </Button>
        </div>
        {state.message && (
          <p role="status" className={state.ok ? "text-accent" : "text-danger"}>
            {state.message}
          </p>
        )}
      </form>
    </details>
  );
}
