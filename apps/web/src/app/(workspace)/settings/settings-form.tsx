"use client";

import { useActionState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "../actions";
import { saveSettings } from "./actions";

/** A settings section: its fields, a save bar, and the outcome. Read-only when `canEdit` is false. */
export function SettingsForm({ section, canEdit, children, extraActions }: { section: string; canEdit: boolean; children: ReactNode; extraActions?: ReactNode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettings, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="section" value={section} />
      <fieldset disabled={!canEdit} className="flex flex-col gap-6">
        {children}
      </fieldset>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      {canEdit ? (
        <div className="border-border flex flex-wrap justify-end gap-2 border-t pt-5">
          {extraActions}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <p className="text-muted text-sm">Your role can view these settings. The secretary can change them.</p>
      )}
    </form>
  );
}
