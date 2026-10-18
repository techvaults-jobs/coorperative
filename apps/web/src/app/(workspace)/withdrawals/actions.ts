"use server";

import { LedgerError, parseNaira } from "@techvaults/core";
import { cancelWithdrawal, decideWithdrawal, PermissionError, payWithdrawal, requestWithdrawal, WithdrawalError } from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { inSociety, requireWorkspace } from "@/lib/session";
import type { FormState } from "../actions";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
function explain(e: unknown) {
  if (e instanceof WithdrawalError || e instanceof PermissionError || e instanceof LedgerError) return e.message;
  console.error(e);
  return "Something went wrong and nothing was saved. Try again.";
}

export async function requestWithdrawalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  let amount;
  try {
    amount = parseNaira(text(formData, "amount"));
  } catch {
    return { ok: false, fieldErrors: { amount: "Enter an amount like 25000 or 25,000.50." } };
  }
  try {
    await inSociety(ws, (tx) =>
      requestWithdrawal(tx, ws.actor, { memberId: text(formData, "memberId"), productId: text(formData, "productId"), amount, reason: text(formData, "reason") }),
    );
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/withdrawals");
  return { ok: true, message: "Request recorded. Another officer approves it; payment can follow once the notice period has passed." };
}

export async function withdrawalStepAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const id = text(formData, "id");
  const step = text(formData, "step");
  try {
    await inSociety(ws, (tx) => {
      if (step === "approve" || step === "reject") return decideWithdrawal(tx, ws.actor, id, step, text(formData, "reason"));
      if (step === "cancel") return cancelWithdrawal(tx, ws.actor, id);
      if (step === "pay")
        return payWithdrawal(tx, ws.actor, id, { bankAccountId: text(formData, "bankAccountId"), paidOn: text(formData, "paidOn"), idempotencyKey: text(formData, "idempotencyKey") }).then(() => undefined);
      throw new WithdrawalError("Unknown step.");
    });
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/withdrawals");
  revalidatePath("/approvals");
  return { ok: true, message: step === "pay" ? "Payment prepared; it's made when another officer approves the entry." : "Done." };
}
