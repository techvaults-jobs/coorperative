"use server";

import { LeadError, recordDemoRequest } from "@techvaults/db";
import { db } from "@/lib/db";

export type DemoState = { ok: boolean; message?: string };

const field = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Save a demo request from the homepage. */
export async function requestDemo(_prev: DemoState, formData: FormData): Promise<DemoState> {
  // Bots fill every field; people never see this one.
  if (field(formData, "website")) return { ok: true, message: "Thank you. We'll be in touch shortly." };
  try {
    await recordDemoRequest(db(), {
      name: field(formData, "name"),
      society: field(formData, "society"),
      role: field(formData, "role"),
      email: field(formData, "email"),
      phone: field(formData, "phone"),
      sector: field(formData, "sector"),
      members: field(formData, "members"),
      message: field(formData, "message"),
    });
  } catch (e) {
    if (e instanceof LeadError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Something went wrong sending your request. Please try again." };
  }
  return { ok: true, message: "Thank you. We've received your request and will be in touch to arrange a walkthrough." };
}
