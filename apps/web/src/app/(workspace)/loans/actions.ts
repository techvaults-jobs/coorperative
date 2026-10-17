"use server";

import { LedgerError, parseNaira, type EligibilityCheck, type Kobo } from "@techvaults/core";
import {
  applyForLoan,
  decideLoan,
  disburseLoan,
  loanEligibility,
  LoanError,
  PermissionError,
  recordRepayment,
  withdrawLoan,
} from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inSociety, requireWorkspace } from "@/lib/session";
import type { FormState } from "../actions";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function explain(e: unknown): string {
  if (e instanceof LoanError || e instanceof PermissionError || e instanceof LedgerError) return e.message;
  console.error(e);
  return "Something went wrong and nothing was saved. Try again.";
}

function amountOf(raw: string): Kobo | null {
  try {
    const k = parseNaira(raw);
    return k > 0n ? k : null;
  } catch {
    return null;
  }
}

export interface Preview {
  eligible: boolean;
  checks: EligibilityCheck[];
  savings: string;
  fee: string;
  totalInterest: string | null;
  totalRepayable: string | null;
  instalments: { number: number; dueDate: string; payment: string; principal: string; interest: string; balance: string }[];
}

/** Live eligibility check and schedule preview for the application form. */
export async function previewLoan(input: { memberId: string; productId: string; amount: string; termMonths: number; guarantors: number }): Promise<Preview | { error: string }> {
  const ws = await requireWorkspace();
  const amount = amountOf(input.amount);
  if (!input.memberId || !input.productId || !amount || !Number.isInteger(input.termMonths) || input.termMonths < 1) return { error: "incomplete" };
  try {
    const r = await inSociety(ws, (tx) => loanEligibility(tx, ws.actor, { ...input, amount }));
    return {
      eligible: r.eligible,
      checks: r.checks,
      savings: r.savings.toString(),
      fee: r.fee.toString(),
      totalInterest: r.schedule?.totalInterest.toString() ?? null,
      totalRepayable: r.schedule?.totalRepayable.toString() ?? null,
      instalments: (r.schedule?.instalments ?? []).map((i) => ({
        number: i.number,
        dueDate: i.dueDate,
        payment: i.payment.toString(),
        principal: i.principal.toString(),
        interest: i.interest.toString(),
        balance: i.balance.toString(),
      })),
    };
  } catch (e) {
    return { error: explain(e) };
  }
}

export async function applyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const amount = amountOf(text(formData, "amount"));
  if (!amount) return { ok: false, fieldErrors: { amount: "Enter the amount requested." } };
  let loan;
  try {
    loan = await inSociety(ws, (tx) =>
      applyForLoan(tx, ws.actor, {
        memberId: text(formData, "memberId"),
        productId: text(formData, "productId"),
        amount,
        termMonths: Number(text(formData, "termMonths")),
        purpose: text(formData, "purpose"),
        guarantorIds: formData.getAll("guarantorIds").map(String).filter(Boolean),
      }),
    );
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/loans");
  redirect(`/loans/${loan.id}?done=applied`);
}

export async function loanDecisionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const loanId = text(formData, "loanId");
  const decision = text(formData, "decision");
  const reason = text(formData, "reason");
  try {
    await inSociety(ws, (tx) => {
      if (decision === "approve" || decision === "reject") return decideLoan(tx, ws.actor, loanId, decision, reason);
      if (decision === "withdraw") return withdrawLoan(tx, ws.actor, loanId, reason);
      throw new LoanError("Unknown decision.");
    });
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/loans");
  redirect(`/loans/${loanId}?done=${decision}`);
}

export async function disburseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const loanId = text(formData, "loanId");
  const disbursedOn = text(formData, "disbursedOn");
  const firstDueDate = text(formData, "firstDueDate");
  if (!DATE.test(disbursedOn) || !DATE.test(firstDueDate)) return { ok: false, message: "Choose the disbursement and first repayment dates." };
  try {
    await inSociety(ws, (tx) =>
      disburseLoan(tx, ws.actor, loanId, { disbursedOn, firstDueDate, bankAccountId: text(formData, "bankAccountId"), idempotencyKey: text(formData, "idempotencyKey") }),
    );
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/loans");
  revalidatePath("/approvals");
  redirect(`/loans/${loanId}?done=disbursing`);
}

export async function repayAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const loanId = text(formData, "loanId");
  const amount = amountOf(text(formData, "amount"));
  const paidOn = text(formData, "paidOn");
  if (!amount) return { ok: false, message: "Enter the amount paid." };
  if (!DATE.test(paidOn)) return { ok: false, message: "Choose the date it was paid." };
  try {
    await inSociety(ws, (tx) => recordRepayment(tx, ws.actor, loanId, { amount, paidOn, bankAccountId: text(formData, "bankAccountId"), idempotencyKey: text(formData, "idempotencyKey") }));
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/loans");
  revalidatePath("/approvals");
  redirect(`/loans/${loanId}?done=repayment`);
}
