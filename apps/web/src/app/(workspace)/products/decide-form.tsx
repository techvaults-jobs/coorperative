"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { FormState } from "../actions";
import { decideProduct } from "./actions";

export function DecideProductForm({ productId, mode }: { productId: string; mode: "decide" | "retire" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(decideProduct, { ok: false });
  const [asking, setAsking] = useState<"reject" | "retire" | null>(null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      {asking ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`reason-${productId}`} className="sr-only">
            Reason
          </label>
          <Input id={`reason-${productId}`} name="reason" placeholder={asking === "reject" ? "What should change?" : "Why is it being retired?"} autoFocus required />
          <Button type="submit" name="decision" value={asking} variant="danger" disabled={pending}>
            {asking === "reject" ? "Send back" : "Retire"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAsking(null)}>
            Cancel
          </Button>
        </div>
      ) : mode === "decide" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="decision" value="approve" disabled={pending}>
            {pending ? "Approving…" : "Approve"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAsking("reject")}>
            Send back…
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsking("retire")}>
          Retire product…
        </Button>
      )}
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
