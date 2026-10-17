"use client";

import type { Module, Sector, SectorProfile, Terminology } from "@techvaults/core";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input } from "@/components/ui/field";
import { SettingsForm } from "../settings-form";

export function SectorEditor({
  canEdit,
  sector: initialSector,
  overrides,
  modules,
  customised,
  sectors,
  moduleOptions,
}: {
  canEdit: boolean;
  sector: Sector;
  overrides: Partial<Terminology>;
  modules: Module[];
  customised: boolean;
  sectors: (SectorProfile & { key: Sector })[];
  moduleOptions: { key: Module; label: string; description: string }[];
}) {
  const [sector, setSector] = useState(initialSector);
  const [useDefaults, setUseDefaults] = useState(!customised);
  const profile = sectors.find((s) => s.key === sector)!;
  const shown = useDefaults ? profile.modules : modules;
  const terms: [keyof Terminology, string][] = [
    ["externalId", "Member's external ID"],
    ["group", "How members are grouped"],
    ["contribution", "Regular payments"],
  ];
  return (
    <SettingsForm section="sector" canEdit={canEdit}>
      <Card>
        <CardHeader title="Sector" description="Sets sensible defaults for the words below and the modules switched on. You can change both." />
        <CardBody>
          <div role="radiogroup" aria-label="Sector" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {sectors.map((s) => (
              <label
                key={s.key}
                className={cn(
                  "border-border hover:border-border-strong flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors",
                  sector === s.key && "border-accent bg-accent-soft ring-accent/20 ring-2",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <input type="radio" name="sector" value={s.key} checked={sector === s.key} onChange={() => setSector(s.key)} className="accent-accent" />
                  {s.label}
                </span>
                <span className="text-muted text-xs leading-relaxed">{s.description}</span>
              </label>
            ))}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Your words" description="Leave a field blank to use the sector's word, shown as the placeholder." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          {terms.map(([key, label]) => (
            <Field key={key} label={label} htmlFor={key}>
              <Input id={key} name={key} defaultValue={overrides[key] ?? ""} placeholder={profile.terminology[key]} maxLength={40} />
            </Field>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Modules" description="Switch off what your society doesn't use; it disappears from menus. Records are kept." />
        <CardBody className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="useDefaults" value="1" checked={useDefaults} onChange={(e) => setUseDefaults(e.target.checked)} className="accent-accent size-4" />
            Use the {profile.label.toLowerCase()} defaults
          </label>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {moduleOptions.map((m) => (
              <label key={m.key} className={cn("border-border flex items-start gap-3 rounded-xl border p-4", useDefaults && "opacity-60")}>
                <input
                  type="checkbox"
                  name="modules"
                  value={m.key}
                  defaultChecked={shown.includes(m.key)}
                  key={`${m.key}-${useDefaults}-${sector}`}
                  disabled={useDefaults}
                  className="accent-accent mt-0.5 size-4"
                />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="text-muted block text-xs">{m.description}</span>
                </span>
              </label>
            ))}
          </div>
        </CardBody>
      </Card>
    </SettingsForm>
  );
}
