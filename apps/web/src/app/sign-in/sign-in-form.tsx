"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (result.error) {
      setPending(false);
      const { status } = result.error;
      // Only a 401 means the credentials were wrong; anything else is a problem on our side.
      setError(
        status === 401
          ? "That email and password don't match an account."
          : status === 429
            ? "Too many attempts. Wait a minute and try again."
            : `Sign-in isn't working right now (error ${status}). Try again shortly, or contact support.`,
      );
      return;
    }
    // When two-factor is on, the client plugin redirects to /sign-in/verify instead.
    if (!(result.data && "twoFactorRedirect" in result.data)) window.location.href = "/overview";
  }

  return (
    // method="post" so that if JavaScript hasn't loaded, a native submit can never put the password in the URL.
    <form onSubmit={onSubmit} method="post" className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" htmlFor="password" error={error}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!error} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link href="/forgot-password" className="text-accent text-center text-sm hover:underline">
        Forgot your password?
      </Link>
    </form>
  );
}
