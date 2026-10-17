"use server";

import { parseNaira, LedgerError, type JournalLine } from "@techvaults/core";
import {
  approveSubmission,
  changeOfficerRoles,
  createMember,
  inviteMember,
  inviteOfficer,
  listAccounts,
  OfficerError,
  PermissionError,
  rejectSubmission,
  removeOfficer,
  requestReversal,
  revokeInvitation,
  submitJournalEntry,
  withdrawSubmission,
} from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { inSociety, requireViewer, requireWorkspace, SOCIETY_COOKIE } from "@/lib/session";

export type FormState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };
export type InviteState = FormState & { link?: string; email?: string };

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
  if (error instanceof PermissionError || error instanceof LedgerError || error instanceof OfficerError) return error.message;
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

export async function submitEntry(_prev: FormState, formData: FormData): Promise<FormState> {
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
      return submitJournalEntry(tx, ws.actor, {
        entryDate,
        description,
        idempotencyKey,
        lines: [line(debit.id, "debit", debit.isMemberControl), line(credit.id, "credit", credit.isMemberControl)],
      });
    });
    revalidatePath("/ledger");
    revalidatePath("/approvals");
    return {
      ok: true,
      message: result.created
        ? "Submitted for approval. It will be posted when another officer approves it."
        : "Already submitted; nothing was duplicated.",
    };
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
}

export async function reverseEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const entryId = text(formData, "entryId");
  const reason = text(formData, "reason");
  if (reason.length < 5) return { ok: false, fieldErrors: { reason: "Explain why this entry is being reversed." } };
  try {
    const today = new Date().toISOString().slice(0, 10);
    await inSociety(ws, (tx) => requestReversal(tx, ws.actor, entryId, { entryDate: today, reason, idempotencyKey: text(formData, "idempotencyKey") }));
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
  // The entry's reverse form disappears while the reversal waits, so report the outcome at page level.
  revalidatePath("/ledger");
  revalidatePath("/approvals");
  redirect("/ledger?reversal=requested");
}

/** Approve, reject or withdraw a submission, then show the outcome at the top of the approvals page. */
export async function decideSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const id = text(formData, "submissionId");
  const decision = text(formData, "decision");
  const reason = text(formData, "reason");
  let outcome: string;
  try {
    if (decision === "approve") {
      const { entryNo } = await inSociety(ws, (tx) => approveSubmission(tx, ws.actor, id));
      outcome = `posted-${entryNo}`;
    } else if (decision === "reject") {
      if (reason.length < 5) return { ok: false, fieldErrors: { reason: "Tell the preparer what needs to change." } };
      await inSociety(ws, (tx) => rejectSubmission(tx, ws.actor, id, reason));
      outcome = "rejected";
    } else if (decision === "withdraw") {
      await inSociety(ws, (tx) => withdrawSubmission(tx, ws.actor, id));
      outcome = "withdrawn";
    } else {
      return { ok: false, message: "Unknown decision." };
    }
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
  revalidatePath("/ledger");
  revalidatePath("/approvals");
  redirect(`/approvals?done=${outcome}`);
}

export async function inviteOfficerAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ws = await requireWorkspace();
  const email = text(formData, "email");
  const roles = formData.getAll("roles").map(String);
  const fieldErrors: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter the officer's email address.";
  if (roles.length === 0) fieldErrors.roles = "Choose at least one role.";
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  try {
    const { token } = await inSociety(ws, (tx) => inviteOfficer(tx, ws.actor, { email, roles }));
    const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
    revalidatePath("/officers");
    return { ok: true, email: email.toLowerCase(), link: `${base}/invite/${token}` };
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
}

export async function revokeInvitationAction(formData: FormData) {
  const ws = await requireWorkspace();
  try {
    await inSociety(ws, (tx) => revokeInvitation(tx, ws.actor, text(formData, "invitationId")));
  } catch (e) {
    redirect(`/officers?error=${encodeURIComponent(describe(e))}`);
  }
  revalidatePath("/officers");
}

export async function updateOfficerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const userId = text(formData, "userId");
  const reason = text(formData, "reason");
  const remove = text(formData, "intent") === "remove";
  if (reason.length < 5) return { ok: false, fieldErrors: { reason: "Give a reason; it goes in the audit trail." } };
  try {
    await inSociety(ws, (tx) =>
      remove ? removeOfficer(tx, ws.actor, userId, reason) : changeOfficerRoles(tx, ws.actor, userId, formData.getAll("roles").map(String), reason),
    );
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
  revalidatePath("/officers");
  // A removed officer's row (and this form) disappears, so report removal at page level.
  if (remove) redirect("/officers?notice=removed");
  return { ok: true, message: "Roles updated." };
}

export async function inviteMemberAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ws = await requireWorkspace();
  const memberId = text(formData, "memberId");
  const email = text(formData, "email");
  try {
    const { token } = await inSociety(ws, (tx) => inviteMember(tx, ws.actor, memberId, email));
    const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
    revalidatePath(`/members/${memberId}`);
    return { ok: true, email: email.toLowerCase(), link: `${base}/invite/${token}` };
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
}
