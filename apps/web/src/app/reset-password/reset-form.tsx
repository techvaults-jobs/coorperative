"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

export function ResetForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">Your password has been changed.</Alert>
        <Link href="/sign-in" className={buttonClass("primary", "w-fit")}>
          Sign in
        </Link>
      </div>
    );
  }
  return (
    <form
      method="post"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const password = String(form.get("password"));
        if (password.length < 12) return setError("Use at least 12 characters.");
        if (password !== String(form.get("confirm"))) return setError("The two passwords don't match.");
        setPending(true);
        setError(undefined);
        const r = await authClient.resetPassword({ newPassword: password, token });
        setPending(false);
        if (r.error) setError(r.error.status === 429 ? "Too many attempts. Wait a minute." : "This link has expired or was already used. Ask for a new one.");
        else setDone(true);
      }}
    >
      <Field label="New password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={error}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={!!error} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
