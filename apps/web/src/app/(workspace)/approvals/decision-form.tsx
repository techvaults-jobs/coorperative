"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { decideSubmission, type FormState } from "../actions";

export function DecisionForm({ submissionId, mode }: { submissionId: string; mode: "decide" | "withdraw" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(decideSubmission, { ok: false });
  const [rejecting, setRejecting] = useState(false);
  const error = state.message ?? state.fieldErrors?.reason;

  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="submissionId" value={submissionId} />
      {mode === "withdraw" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted text-xs">You prepared this, so another officer must approve it.</p>
          <Button type="submit" name="decision" value="withdraw" variant="secondary" disabled={pending}>
            Withdraw
          </Button>
        </div>
      ) : rejecting ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <label htmlFor={`reason-${submissionId}`} className="sr-only">
            Reason for rejecting
          </label>
          <Input id={`reason-${submissionId}`} name="reason" placeholder="What needs to change, e.g. wrong member" autoFocus required />
          <Button type="submit" name="decision" value="reject" variant="danger" disabled={pending}>
            {pending ? "Rejecting…" : "Reject"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="decision" value="approve" disabled={pending}>
            {pending ? "Approving…" : "Approve and post"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRejecting(true)}>
            Reject…
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
