"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input } from "@/components/ui/field";
import { SettingsForm } from "../settings-form";

const PRODUCT_COLOUR = "#cc2a2f";

export function BrandingEditor({ current, presets, name, canEdit }: { current: string | null; presets: { name: string; color: string }[]; name: string; canEdit: boolean }) {
  const [color, setColor] = useState(current ?? PRODUCT_COLOUR);
  const valid = /^#[0-9a-f]{6}$/i.test(color);
  return (
    <SettingsForm
      section="branding"
      canEdit={canEdit}
      extraActions={
        current && (
          <Button type="submit" name="useProductColour" value="1" variant="ghost">
            Use the Cooperative Vaults colour
          </Button>
        )
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Brand colour" description="Used for buttons, links, highlights and charts across your society's workspace. It must be dark enough for white text." />
          <CardBody className="flex flex-col gap-6">
            <div role="radiogroup" aria-label="Preset colours" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {presets.map((p) => {
                const selected = p.color === color.toLowerCase();
                return (
                  <button
                    key={p.color}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setColor(p.color)}
                    className={cn("border-border hover:border-border-strong flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors", selected && "border-foreground ring-foreground/10 ring-2")}
                  >
                    <span className="flex size-7 items-center justify-center rounded-lg text-white" style={{ background: p.color }}>
                      {selected && <Check className="size-4" aria-hidden />}
                    </span>
                    {p.name}
                  </button>
                );
              })}
            </div>
            <Field label="Custom colour" htmlFor="brandColor" hint="Pick a colour or type a hex value.">
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Colour picker"
                  value={valid ? color : PRODUCT_COLOUR}
                  onChange={(e) => setColor(e.target.value)}
                  className="border-border h-10 w-14 cursor-pointer rounded-lg border bg-transparent p-1"
                />
                <Input id="brandColor" name="brandColor" value={color} onChange={(e) => setColor(e.target.value)} className="max-w-40 font-mono" />
              </div>
            </Field>
          </CardBody>
        </Card>
        <Card className="branded h-fit" style={{ "--brand": valid ? color : PRODUCT_COLOUR } as React.CSSProperties}>
          <CardHeader title="Preview" description="How your workspace will look" />
          <CardBody className="flex flex-col gap-4">
            <div className="bg-sidebar flex items-center gap-3 rounded-xl p-3">
              <span className="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-lg text-sm font-bold">{name.slice(0, 1)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{name}</p>
                <p className="text-sidebar-accent text-xs">● Active section</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="bg-accent text-accent-foreground rounded-lg px-3.5 py-2 text-sm font-medium">Primary action</span>
              <span className="bg-accent-soft text-accent rounded-lg px-3.5 py-2 text-sm font-medium">Highlight</span>
            </div>
            <p className="text-sm">
              Members can <span className="text-accent font-medium underline">open their statement</span> any time.
            </p>
            <div className="flex h-16 items-end gap-1.5">
              {[40, 55, 48, 70, 62, 85, 78, 100].map((h, i) => (
                <span key={i} className="bg-accent flex-1 rounded-t-[3px]" style={{ height: `${h}%`, opacity: i === 7 ? 1 : 0.55 }} />
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </SettingsForm>
  );
}
