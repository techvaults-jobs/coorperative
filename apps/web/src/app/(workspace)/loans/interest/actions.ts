"use server";

import { LedgerError } from "@techvaults/core";
import { InterestError, PermissionError, submitInterestRun } from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inSociety, requireWorkspace } from "@/lib/session";
import type { FormState } from "../../actions";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function chargeInterestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const period = text(formData, "period");
  try {
    await inSociety(ws, (tx) => submitInterestRun(tx, ws.actor, { period, idempotencyKey: text(formData, "idempotencyKey") }));
  } catch (e) {
    if (e instanceof InterestError || e instanceof PermissionError || e instanceof LedgerError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Something went wrong and nothing was charged. Try again." };
  }
  revalidatePath("/loans/interest");
  redirect(`/loans/interest/${period}?done=submitted`);
}
