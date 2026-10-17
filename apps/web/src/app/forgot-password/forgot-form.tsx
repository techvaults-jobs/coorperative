"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (sent) {
    return (
      <Alert tone="success" title="Check your email">
        If there&apos;s an account for that address, a reset link is on its way. It works for one hour. If nothing arrives, ask your society&apos;s secretary for help.
      </Alert>
    );
  }
  return (
    <form
      method="post"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(undefined);
        const email = String(new FormData(e.currentTarget).get("email"));
        const r = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setPending(false);
        // Same answer whether or not the account exists, so the form can't be used to find accounts.
        if (r.error?.status === 429) setError("Too many attempts. Wait a minute and try again.");
        else setSent(true);
      }}
    >
      <Field label="Email" htmlFor="email" error={error}>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/sign-in" className="text-accent text-center text-sm hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
