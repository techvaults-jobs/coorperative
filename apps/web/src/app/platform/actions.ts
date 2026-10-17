"use server";

import { createSociety, PermissionError, SettingsError } from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { appUrl, mails, sendMail } from "@/lib/mail";
import { requirePlatformStaff } from "@/lib/session";

export type OnboardState = { ok: boolean; message?: string; link?: string; email?: string; name?: string; delivered?: boolean };

const field = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function onboardSociety(_prev: OnboardState, formData: FormData): Promise<OnboardState> {
  const viewer = await requirePlatformStaff();
  try {
    const { token } = await createSociety(db(), viewer.user.id, {
      name: field(formData, "name"),
      shortName: field(formData, "shortName"),
      state: field(formData, "state"),
      registrar: field(formData, "registrar"),
      registrationNumber: field(formData, "registrationNumber"),
      sector: field(formData, "sector"),
      brandColor: field(formData, "brandColor"),
      secretaryEmail: field(formData, "secretaryEmail"),
    });
    revalidatePath("/platform");
    const link = `${appUrl()}/invite/${token}`;
    const email = field(formData, "secretaryEmail").trim().toLowerCase();
    const { delivered } = await sendMail(mails.societyCreated(email, field(formData, "name").trim(), link));
    return { ok: true, link, email, name: field(formData, "name").trim(), delivered };
  } catch (e) {
    if (e instanceof SettingsError || e instanceof PermissionError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Something went wrong and the society wasn't created." };
  }
}
