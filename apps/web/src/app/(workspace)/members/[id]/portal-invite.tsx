"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { inviteMemberAction, type InviteState } from "../../actions";

export function PortalInvite({ memberId, defaultEmail }: { memberId: string; defaultEmail: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMemberAction, { ok: false });
  const [copied, setCopied] = useState(false);
  if (state.ok && state.link) {
    return (
      <div className="flex flex-col gap-3 text-sm" role="status">
        <p className="text-accent font-medium">Invitation created for {state.email}.</p>
        <p className="text-muted text-xs">
          {state.delivered ? "We've emailed it to the member. You can also share the link yourself." : "Email isn't set up yet, so send this private link to the member yourself."} It works
          once, expires in 7 days and can&apos;t be shown again.
        </p>
        <label htmlFor="member-invite-link" className="sr-only">
          Invitation link
        </label>
        <Input id="member-invite-link" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <div>
          <Button
            type="button"
            size="sm"
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
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="memberId" value={memberId} />
      <Field label="Member's email" htmlFor="portal-email" className="flex-1">
        <Input id="portal-email" name="email" type="email" defaultValue={defaultEmail} required />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Creating…" : "Create invitation link"}
      </Button>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
    </form>
  );
}
