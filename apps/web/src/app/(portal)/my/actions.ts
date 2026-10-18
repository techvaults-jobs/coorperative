"use server";

import { parseNaira, type EligibilityCheck, type Kobo } from "@techvaults/core";
import { applyForLoan, loanEligibility, LoanError, PermissionError, requestWithdrawal, resolveGuarantors, WithdrawalError, withSociety } from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePortal } from "@/lib/session";

export type MemberApplyState = { ok: boolean; message?: string };
export interface MemberPreview {
  eligible: boolean;
  checks: EligibilityCheck[];
  payment: string | null;
  totalRepayable: string | null;
  fee: string;
  guarantors: { memberNo: string; name: string | null }[];
}

const amountOf = (raw: string): Kobo | null => {
  try {
    const k = parseNaira(raw);
    return k > 0n ? k : null;
  } catch {
    return null;
  }
};

/** Eligibility for the signed-in member's own application, with guarantor names confirmed. */
export async function previewOwnLoan(input: { productId: string; amount: string; termMonths: number; guarantorNos: string[] }): Promise<MemberPreview | { error: string }> {
  const me = await requirePortal();
  const amount = amountOf(input.amount);
  if (!input.productId || !amount || !Number.isInteger(input.termMonths) || input.termMonths < 1) return { error: "incomplete" };
  try {
    return await withSociety(db(), me.society.societyId, async (tx) => {
      const guarantors = await resolveGuarantors(tx, me.actor, input.guarantorNos);
      const r = await loanEligibility(tx, me.actor, { memberId: me.memberId, productId: input.productId, amount, termMonths: input.termMonths, guarantors: guarantors.filter((g) => g.id).length });
      return {
        eligible: r.eligible && guarantors.every((g) => g.id),
        checks: r.checks,
        payment: r.schedule?.instalments[0]?.payment.toString() ?? null,
        totalRepayable: r.schedule?.totalRepayable.toString() ?? null,
        fee: r.fee.toString(),
        guarantors: guarantors.map((g) => ({ memberNo: g.memberNo, name: g.name })),
      };
    });
  } catch (e) {
    return { error: e instanceof LoanError || e instanceof PermissionError ? e.message : "Couldn't check right now." };
  }
}

export async function applyOwnLoan(_prev: MemberApplyState, formData: FormData): Promise<MemberApplyState> {
  const me = await requirePortal();
  const amount = amountOf(String(formData.get("amount") ?? ""));
  if (!amount) return { ok: false, message: "Enter the amount you'd like to borrow." };
  let loanId: string;
  try {
    loanId = await withSociety(db(), me.society.societyId, async (tx) => {
      const guarantors = await resolveGuarantors(tx, me.actor, formData.getAll("guarantorNos").map(String));
      const missing = guarantors.filter((g) => !g.id).map((g) => g.memberNo);
      if (missing.length) throw new LoanError(`No active member found for ${missing.join(", ")}.`);
      const loan = await applyForLoan(tx, me.actor, {
        memberId: me.memberId,
        productId: String(formData.get("productId") ?? ""),
        amount,
        termMonths: Number(formData.get("termMonths")),
        purpose: String(formData.get("purpose") ?? ""),
        guarantorIds: guarantors.map((g) => g.id!),
      });
      return loan.id;
    });
  } catch (e) {
    return { ok: false, message: e instanceof LoanError || e instanceof PermissionError ? e.message : "Something went wrong and nothing was sent. Try again." };
  }
  revalidatePath("/my");
  redirect(`/my/loans/${loanId}?applied=1`);
}

export async function requestOwnWithdrawal(_prev: MemberApplyState, formData: FormData): Promise<MemberApplyState> {
  const me = await requirePortal();
  const amount = amountOf(String(formData.get("amount") ?? ""));
  if (!amount) return { ok: false, message: "Enter how much you'd like to withdraw." };
  try {
    await withSociety(db(), me.society.societyId, (tx) =>
      requestWithdrawal(tx, me.actor, { memberId: me.memberId, productId: String(formData.get("productId") ?? ""), amount, reason: String(formData.get("reason") ?? "") }),
    );
  } catch (e) {
    return { ok: false, message: e instanceof WithdrawalError || e instanceof PermissionError ? e.message : "Something went wrong and nothing was sent. Try again." };
  }
  revalidatePath("/my/withdraw");
  return { ok: true, message: "Request sent. An officer will review it; you'll be paid after the notice period." };
}
