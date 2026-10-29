"use server";

import { LedgerError, parseNaira, type Kobo } from "@techvaults/core";
import { CollectionError, createCollectionSheet, PermissionError, saveCollectionSheet, setMeetingWeekday, submitCollectionSheet } from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inSociety, requireWorkspace } from "@/lib/session";
import type { FormState } from "../actions";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function explain(e: unknown): string {
  if (e instanceof CollectionError || e instanceof PermissionError || e instanceof LedgerError) return e.message;
  console.error(e);
  return "Something went wrong and nothing was saved. Try again.";
}

function amount(raw: string): Kobo {
  return parseNaira(raw.trim() === "" ? "0" : raw);
}

export async function openSheetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  let id: string;
  try {
    id = await inSociety(ws, (tx) => createCollectionSheet(tx, ws.actor, { meetingDate: text(formData, "meetingDate") }));
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/collections");
  redirect(`/collections/${id}`);
}

export async function meetingDayAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const raw = text(formData, "weekday");
  try {
    await inSociety(ws, (tx) => setMeetingWeekday(tx, ws.actor, raw === "" ? null : Number(raw)));
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/collections");
  return { ok: true, message: "Meeting day saved." };
}

export type SaveState = FormState & { problems?: { memberNo: string; message: string }[] };

/** The grid posts one field per filled cell, named `a:<memberId>:<column key>`. */
export async function saveSheetAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const ws = await requireWorkspace();
  const sheetId = text(formData, "sheetId");
  const byMember = new Map<string, Record<string, Kobo>>();
  try {
    for (const [name, value] of formData.entries()) {
      if (!name.startsWith("a:")) continue;
      const [, memberId, key] = name.split(":");
      if (!memberId || !key) continue;
      const amounts = byMember.get(memberId) ?? {};
      amounts[key] = amount(String(value));
      byMember.set(memberId, amounts);
    }
  } catch {
    return { ok: false, message: "Enter amounts like 5000 or 5,000.50." };
  }
  try {
    const result = await inSociety(ws, (tx) => saveCollectionSheet(tx, ws.actor, sheetId, [...byMember].map(([memberId, amounts]) => ({ memberId, amounts }))));
    if (result.problems.length) return { ok: false, message: "Nothing was saved. Fix these rows first:", problems: result.problems.slice(0, 20) };
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath(`/collections/${sheetId}`);
  revalidatePath("/collections");
  return { ok: true, message: "Sheet saved." };
}

export async function submitSheetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const sheetId = text(formData, "sheetId");
  try {
    const input = {
      cashCounted: amount(text(formData, "cashCounted")),
      transfers: amount(text(formData, "transfers")),
      bankAccountId: text(formData, "bankAccountId"),
      lodgementRef: text(formData, "lodgementRef"),
      differenceNote: text(formData, "differenceNote"),
      idempotencyKey: text(formData, "idempotencyKey"),
    };
    await inSociety(ws, (tx) => submitCollectionSheet(tx, ws.actor, sheetId, input));
  } catch (e) {
    if (e instanceof SyntaxError) return { ok: false, message: "Enter amounts like 5000 or 5,000.50." };
    return { ok: false, message: explain(e) };
  }
  revalidatePath(`/collections/${sheetId}`);
  revalidatePath("/collections");
  revalidatePath("/approvals");
  redirect(`/collections/${sheetId}?done=submit`);
}
