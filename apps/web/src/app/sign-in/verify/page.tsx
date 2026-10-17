"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

export default function VerifyPage() {
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const code = String(new FormData(event.currentTarget).get("code")).trim();
    const result = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
    if (result.error) {
      setPending(false);
      setError(useBackup ? "That backup code isn't valid or was already used." : "That code isn't right. Codes change every 30 seconds.");
      return;
    }
    window.location.href = "/overview";
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Two-factor check</h1>
        <p className="text-muted text-sm">
          {useBackup ? "Enter one of the backup codes you saved when you set up two-factor authentication." : "Enter the 6-digit code from your authenticator app."}
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={useBackup ? "Backup code" : "Authentication code"} htmlFor="code" error={error}>
          <Input
            id="code"
            name="code"
            required
            autoComplete="one-time-code"
            inputMode={useBackup ? "text" : "numeric"}
            pattern={useBackup ? undefined : "[0-9]{6}"}
            aria-invalid={!!error}
            className="font-mono tracking-widest"
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Verify"}
        </Button>
        <button type="button" className="text-accent text-sm underline-offset-2 hover:underline" onClick={() => setUseBackup((v) => !v)}>
          {useBackup ? "Use authenticator app instead" : "Use a backup code instead"}
        </button>
      </form>
    </main>
  );
}
