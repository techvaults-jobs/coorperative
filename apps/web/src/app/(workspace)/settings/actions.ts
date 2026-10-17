"use server";

import type { AccountClass } from "@techvaults/core";
import { createAccount, PermissionError, setAccountActive, SettingsError, updateSocietySettings, type SettingsChanges } from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { inSociety, requireWorkspace } from "@/lib/session";
import type { FormState } from "../actions";

const text = (f: FormData, k: string) => String(f.get(k) ?? "");

function explain(e: unknown): string {
  if (e instanceof SettingsError || e instanceof PermissionError) return e.message;
  console.error(e);
  return "Something went wrong and nothing was saved. Try again.";
}

/** Save one settings section. Only that section's fields are sent, so other settings stay as they are. */
export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const section = text(formData, "section");
  let changes: SettingsChanges;
  if (section === "general") {
    changes = {
      name: text(formData, "name"),
      shortName: text(formData, "shortName"),
      registrationNumber: text(formData, "registrationNumber"),
      cvn: text(formData, "cvn"),
      state: text(formData, "state"),
      registrar: text(formData, "registrar"),
      address: text(formData, "address"),
      phone: text(formData, "phone"),
      email: text(formData, "email"),
      financialYearStart: Number(text(formData, "financialYearStart")),
    };
  } else if (section === "branding") {
    changes = { brandColor: text(formData, "useProductColour") ? null : text(formData, "brandColor") };
  } else if (section === "sector") {
    changes = {
      sector: text(formData, "sector"),
      terminology: { externalId: text(formData, "externalId"), group: text(formData, "group"), contribution: text(formData, "contribution") },
      modules: text(formData, "useDefaults") ? null : formData.getAll("modules").map(String),
    };
  } else {
    return { ok: false, message: "Unknown settings section." };
  }
  try {
    await inSociety(ws, (tx) => updateSocietySettings(tx, ws.actor, changes));
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  // Colour, words and modules show on every page.
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. The change is recorded in the audit trail." };
}

export async function addAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  try {
    const row = await inSociety(ws, (tx) =>
      createAccount(tx, ws.actor, {
        code: text(formData, "code"),
        name: text(formData, "name"),
        class: text(formData, "class") as AccountClass,
        isMemberControl: !!text(formData, "isMemberControl"),
      }),
    );
    revalidatePath("/settings/accounts");
    return { ok: true, message: `Added ${row.code} · ${row.name}.` };
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
}

export async function toggleAccount(formData: FormData) {
  const ws = await requireWorkspace();
  await inSociety(ws, (tx) => setAccountActive(tx, ws.actor, text(formData, "accountId"), text(formData, "active") === "true"));
  revalidatePath("/settings/accounts");
}
