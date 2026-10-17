"use client";

import QRCode from "qrcode";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

const TOO_MANY = "Too many attempts. Wait 10 seconds, then try again.";

type Step = { kind: "idle" } | { kind: "scan"; qr: string; secret: string; backupCodes: string[] } | { kind: "done"; backupCodes: string[] };

export function TwoFactorSetup({ enabled, officer }: { enabled: boolean; officer: boolean }) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const password = String(new FormData(event.currentTarget).get("password"));
    const result = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (result.error || !result.data) {
      setError(result.error?.status === 429 ? TOO_MANY : "That password isn't right.");
      return;
    }
    if (result.data.method !== "totp") {
      setError("This account is set up for a different two-factor method. Contact support.");
      return;
    }
    const uri = result.data.totpURI;
    setStep({
      kind: "scan",
      qr: await QRCode.toDataURL(uri, { margin: 1, width: 200 }),
      secret: new URL(uri).searchParams.get("secret") ?? "",
      backupCodes: result.data.backupCodes,
    });
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "scan") return;
    setPending(true);
    setError(undefined);
    const code = String(new FormData(event.currentTarget).get("code")).trim();
    const result = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (result.error) {
      setError(result.error.status === 429 ? TOO_MANY : "That code isn't right. Check your phone's clock is set automatically and try the newest code.");
      return;
    }
    setStep({ kind: "done", backupCodes: step.backupCodes });
  }

  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const password = String(new FormData(event.currentTarget).get("password"));
    const result = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (result.error) {
      setError(result.error.status === 429 ? TOO_MANY : "That password isn't right.");
      return;
    }
    window.location.reload();
  }

  if (step.kind === "done") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-accent text-sm font-medium">Two-factor authentication is on.</p>
        <BackupCodes codes={step.backupCodes} />
        <Button onClick={() => (window.location.href = "/overview")}>Continue</Button>
      </div>
    );
  }

  if (step.kind === "scan") {
    return (
      <div className="flex flex-col gap-4">
        <ol className="text-muted flex list-decimal flex-col gap-1 pl-5 text-sm">
          <li>Open your authenticator app and add an account.</li>
          <li>Scan this code, or type the setup key.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the device */}
          <img src={step.qr} alt="QR code for your authenticator app" width={160} height={160} className="rounded border bg-white p-1" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted text-xs">Setup key</span>
            <code className="font-mono text-sm break-all">{step.secret}</code>
          </div>
        </div>
        <form onSubmit={confirm} method="post" className="flex flex-col gap-3">
          <Field label="6-digit code" htmlFor="code" error={error}>
            <Input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required className="font-mono tracking-widest" />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Checking…" : "Turn on two-factor"}
          </Button>
        </form>
      </div>
    );
  }

  if (enabled) {
    return (
      <form onSubmit={disable} method="post" className="flex flex-col gap-3">
        {officer && <p className="text-muted text-sm">Your role requires two-factor. If you turn it off you won&apos;t be able to open your society&apos;s records until you turn it back on.</p>}
        <Field label="Confirm your password to turn it off" htmlFor="password" error={error}>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="danger" disabled={pending}>
          Turn off two-factor
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={start} method="post" className="flex flex-col gap-3">
      <Field label="Confirm your password to start" htmlFor="password" error={error}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Set up two-factor"}
      </Button>
    </form>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="bg-warning-soft flex flex-col gap-2 rounded-md p-4">
      <p className="text-warning text-sm font-medium">Save these backup codes somewhere safe. Each works once if you lose your phone. They won&apos;t be shown again.</p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}
