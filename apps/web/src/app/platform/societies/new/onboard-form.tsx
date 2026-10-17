"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { onboardSociety, type OnboardState } from "../../actions";

export function OnboardForm({ sectors }: { sectors: { value: string; label: string; description: string }[] }) {
  const [state, action, pending] = useActionState<OnboardState, FormData>(onboardSociety, { ok: false });
  const [copied, setCopied] = useState(false);
  if (state.ok && state.link) {
    return (
      <Card className="max-w-2xl">
        <CardHeader title={`${state.name} is set up`} description={`${state.delivered ? `We've emailed the secretary (${state.email}); the link is also below.` : `Email isn't set up yet, so send this private link to the secretary (${state.email}).`} It works once and expires in 7 days.`} />
        <CardBody className="flex flex-col gap-3">
          <label htmlFor="secretary-link" className="sr-only">
            Invitation link
          </label>
          <Input id="secretary-link" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <div className="flex gap-2">
            <Button
              type="button"
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
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
              Onboard another
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader title="Society" description="As registered with the Director of Co-operatives." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Registered name" htmlFor="name" className="sm:col-span-2">
            <Input id="name" name="name" required />
          </Field>
          <Field label="Short name" htmlFor="shortName" hint="Optional, e.g. UNILAG SCS">
            <Input id="shortName" name="shortName" />
          </Field>
          <Field label="Registration number" htmlFor="registrationNumber">
            <Input id="registrationNumber" name="registrationNumber" className="font-mono" />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" name="state" required />
          </Field>
          <Field label="Registering Director of Co-operatives" htmlFor="registrar">
            <Input id="registrar" name="registrar" placeholder="e.g. Lagos State Director of Co-operatives" required />
          </Field>
          <Field label="Sector" htmlFor="sector" hint="Sets the starter chart of accounts, words and modules. The society can change them.">
            <Select id="sector" name="sector" defaultValue="workplace">
              {sectors.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand colour" htmlFor="brandColor" hint="Optional hex, e.g. #1d5fae. Must be dark enough for white text.">
            <Input id="brandColor" name="brandColor" className="font-mono" placeholder="#0d7a5f" />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="First secretary" description="They receive the invitation, set up the society and invite the other officers." />
        <CardBody>
          <Field label="Secretary's email" htmlFor="secretaryEmail">
            <Input id="secretaryEmail" name="secretaryEmail" type="email" required />
          </Field>
        </CardBody>
      </Card>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating…" : "Create society and invitation"}
        </Button>
      </div>
    </form>
  );
}
