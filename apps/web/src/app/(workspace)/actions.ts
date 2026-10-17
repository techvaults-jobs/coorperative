"use server";

import { parseNaira, LedgerError, type JournalLine } from "@techvaults/core";
import { createMember, PermissionError, postJournalEntry, reverseJournalEntry, listAccounts } from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { inSociety, requireViewer, requireWorkspace, SOCIETY_COOKIE } from "@/lib/session";

export type FormState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

export async function switchSociety(formData: FormData) {
  const viewer = await requireViewer();
  const id = String(formData.get("societyId"));
  // Only societies the person actually belongs to can be selected.
  if (!viewer.societies.some((s) => s.societyId === id)) return;
  (await cookies()).set(SOCIETY_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/overview");
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function describe(error: unknown): string {
  if (error instanceof PermissionError || error instanceof LedgerError) return error.message;
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  if (cause?.code === "23505") return "That record already exists. Member numbers and staff IDs must be unique within the society.";
  if (cause?.code === "23514" || cause?.code === "23001") return cause.message ?? "The database rejected this change.";
  console.error(error);
  return "Something went wrong and nothing was saved. Try again, or contact support if it keeps happening.";
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const input = {
    memberNo: text(formData, "memberNo"),
    fullName: text(formData, "fullName"),
    staffId: text(formData, "staffId") || null,
    department: text(formData, "department") || null,
    phone: text(formData, "phone") || null,
    email: text(formData, "email") || null,
    joinedOn: text(formData, "joinedOn") || null,
  };
  const fieldErrors: Record<string, string> = {};
  if (!input.memberNo) fieldErrors.memberNo = "Enter a member number.";
  if (input.fullName.length < 3) fieldErrors.fullName = "Enter the member's full name.";
  if (input.joinedOn && !DATE.test(input.joinedOn)) fieldErrors.joinedOn = "Use a valid date.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) fieldErrors.email = "Enter a valid email or leave it blank.";
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  try {
    await inSociety(ws, (tx) => createMember(tx, ws.actor, { ...input, status: "active" }));
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
  revalidatePath("/members");
  return { ok: true, message: `${input.fullName} was added as member ${input.memberNo}.` };
}

export async function postEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const entryDate = text(formData, "entryDate");
  const description = text(formData, "description");
  const debitAccountId = text(formData, "debitAccountId");
  const creditAccountId = text(formData, "creditAccountId");
  const memberId = text(formData, "memberId");
  const idempotencyKey = text(formData, "idempotencyKey");
  const fieldErrors: Record<string, string> = {};
  let amount;
  try {
    amount = parseNaira(text(formData, "amount"));
    if (amount <= 0n) fieldErrors.amount = "Enter an amount greater than zero.";
  } catch {
    fieldErrors.amount = "Enter an amount like 15000 or 15,000.50.";
  }
  if (!DATE.test(entryDate)) fieldErrors.entryDate = "Choose the accounting date.";
  if (description.length < 4) fieldErrors.description = "Describe what this entry is for.";
  if (!debitAccountId) fieldErrors.debitAccountId = "Choose the account to debit.";
  if (!creditAccountId) fieldErrors.creditAccountId = "Choose the account to credit.";
  if (debitAccountId && debitAccountId === creditAccountId) fieldErrors.creditAccountId = "Debit and credit must be different accounts.";
  if (Object.keys(fieldErrors).length || !amount) return { ok: false, fieldErrors };

  try {
    const result = await inSociety(ws, async (tx) => {
      const accounts = await listAccounts(tx, ws.actor);
      const byId = new Map(accounts.map((a) => [a.id, a]));
      const debit = byId.get(debitAccountId);
      const credit = byId.get(creditAccountId);
      if (!debit || !credit) throw new LedgerError("UNBALANCED", "Choose accounts from the list.");
      if ((debit.isMemberControl || credit.isMemberControl) && !memberId) {
        throw new LedgerError("UNBALANCED", "This entry touches a member account, so choose the member.");
      }
      const line = (accountId: string, side: "debit" | "credit", control: boolean): JournalLine => ({
        accountId,
        side,
        amount: amount!,
        ...(control ? { memberId } : {}),
      });
      return postJournalEntry(tx, ws.actor, {
        entryDate,
        description,
        idempotencyKey,
        lines: [line(debit.id, "debit", debit.isMemberControl), line(credit.id, "credit", credit.isMemberControl)],
      });
    });
    revalidatePath("/ledger");
    return { ok: true, message: result.created ? `Posted as entry #${result.entryNo}.` : `Already posted as entry #${result.entryNo}; nothing was duplicated.` };
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
}

export async function reverseEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const entryId = text(formData, "entryId");
  const reason = text(formData, "reason");
  if (reason.length < 5) return { ok: false, fieldErrors: { reason: "Explain why this entry is being reversed." } };
  let entryNo: bigint;
  try {
    const today = new Date().toISOString().slice(0, 10);
    ({ entryNo } = await inSociety(ws, (tx) =>
      reverseJournalEntry(tx, ws.actor, entryId, { entryDate: today, reason, idempotencyKey: `reverse:${entryId}` }),
    ));
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
  // The reversed entry's form disappears, so report the outcome at page level.
  revalidatePath("/ledger");
  redirect(`/ledger?reversal=${entryNo}`);
}
