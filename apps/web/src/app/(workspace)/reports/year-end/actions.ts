"use server";

import { LedgerError } from "@techvaults/core";
import { PermissionError, submitYearEnd, YearEndError } from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { inSociety, requireWorkspace } from "@/lib/session";
import type { FormState } from "../../actions";

export async function closeYearAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  try {
    await inSociety(ws, (tx) => submitYearEnd(tx, ws.actor, { start, end }));
  } catch (e) {
    if (e instanceof YearEndError || e instanceof PermissionError || e instanceof LedgerError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Something went wrong and nothing was prepared." };
  }
  revalidatePath("/reports/year-end");
  revalidatePath("/approvals");
  return { ok: true, message: "Closing entry prepared. The year closes and locks when another officer approves it in Approvals." };
}
