"use server";

import { parseNaira, LedgerError, type JournalLine } from "@techvaults/core";
import {
  approveSubmission,
  changeOfficerRoles,
  createMember,
  inviteMember,
  decideRoleGrant,
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
import { appUrl, mails, sendMail } from "@/lib/mail";
import { roleLabel } from "@/lib/roles";
import { inSociety, requireViewer, requireWorkspace, SOCIETY_COOKIE } from "@/lib/session";

export type FormState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };
export type InviteState = FormState & { link?: string; email?: string; delivered?: boolean; needsApproval?: boolean };

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

/** Prepare a journal entry of any number of lines; another officer approves it. */
export async function submitEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const entryDate = text(formData, "entryDate");
  const description = text(formData, "description");
  const idempotencyKey = text(formData, "idempotencyKey");
  const all = (k: string) => formData.getAll(k).map((v) => String(v).trim());
  const [accountIds, memberIds, debits, credits] = [all("accountId"), all("memberId"), all("debit"), all("credit")];
  const fieldErrors: Record<string, string> = {};
  if (!DATE.test(entryDate)) fieldErrors.entryDate = "Choose the accounting date.";
  if (description.length < 4) fieldErrors.description = "Describe what this entry is for.";

  const money = (raw: string) => {
    if (!raw) return 0n;
    try {
      return parseNaira(raw);
    } catch {
      return null;
    }
  };
  const lines: { index: number; accountId: string; memberId: string; side: "debit" | "credit"; amount: bigint }[] = [];
  accountIds.forEach((accountId, i) => {
    const d = money(debits[i] ?? "");
    const c = money(credits[i] ?? "");
    if (!accountId && !d && !c) return; // an empty row
    if (d === null || c === null || (d ?? 0n) < 0n || (c ?? 0n) < 0n) return void (fieldErrors[`line-${i}`] = "Enter amounts like 15000 or 15,000.50.");
    if (!accountId) return void (fieldErrors[`line-${i}`] = "Choose an account.");
    if (d === 0n && c === 0n) return void (fieldErrors[`line-${i}`] = "Enter an amount on this line, or remove it.");
    if (d > 0n && c > 0n) return void (fieldErrors[`line-${i}`] = "Enter a debit or a credit, not both.");
    lines.push({ index: i, accountId, memberId: memberIds[i] ?? "", side: d > 0n ? "debit" : "credit", amount: d > 0n ? d : c });
  });
  const debitTotal = lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0n);
  const creditTotal = lines.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0n);
  if (!Object.keys(fieldErrors).some((k) => k.startsWith("line-"))) {
    if (lines.length < 2) fieldErrors.lines = "An entry needs at least two lines.";
    else if (debitTotal !== creditTotal) fieldErrors.lines = "Debits and credits must be equal before the entry can be submitted.";
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  try {
    const result = await inSociety(ws, async (tx) => {
      const accounts = new Map((await listAccounts(tx, ws.actor)).map((a) => [a.id, a]));
      const journalLines: JournalLine[] = lines.map((l) => {
        const account = accounts.get(l.accountId);
        if (!account) throw new LedgerError("UNBALANCED", "Choose accounts from the list.");
        if (account.isMemberControl && !l.memberId) throw new LedgerError("UNBALANCED", `Choose the member for ${account.code} ${account.name}.`);
        return { accountId: l.accountId, side: l.side, amount: l.amount as JournalLine["amount"], ...(account.isMemberControl ? { memberId: l.memberId } : {}) };
      });
      return submitJournalEntry(tx, ws.actor, { entryDate, description, idempotencyKey, lines: journalLines });
    });
    // A fresh page means a fresh idempotency key for the next entry.
    revalidatePath("/ledger/new");
    revalidatePath("/ledger");
    revalidatePath("/approvals");
    return {
      ok: true,
      message: result.created ? "Submitted for approval. It will be posted when another officer approves it." : "Already submitted; nothing was duplicated.",
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
    const { token, needsApproval } = await inSociety(ws, (tx) => inviteOfficer(tx, ws.actor, { email, roles }));
    const link = `${appUrl()}/invite/${token}`;
    const { delivered } = await sendMail(
      mails.officerInvite(email.toLowerCase(), ws.society.societyName, roles.map(roleLabel).join(", "), link, ws.user.name, needsApproval),
    );
    revalidatePath("/officers");
    return { ok: true, email: email.toLowerCase(), link, delivered, needsApproval };
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
  let pending = false;
  try {
    await inSociety(ws, async (tx) => {
      if (remove) await removeOfficer(tx, ws.actor, userId, reason);
      else ({ pending } = await changeOfficerRoles(tx, ws.actor, userId, formData.getAll("roles").map(String), reason));
    });
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
  revalidatePath("/officers");
  // A removed officer's row (and this form) disappears, so report removal at page level.
  if (remove) redirect("/officers?notice=removed");
  return { ok: true, message: pending ? "Sent for approval. A second officer must approve before the new roles apply." : "Roles updated." };
}

export async function decideRoleGrantAction(formData: FormData) {
  const ws = await requireWorkspace();
  const decision = text(formData, "decision") === "approve" ? "approve" : "reject";
  try {
    await inSociety(ws, (tx) => decideRoleGrant(tx, { ...ws.actor, email: ws.user.email }, text(formData, "requestId"), decision));
  } catch (e) {
    redirect(`/officers?error=${encodeURIComponent(describe(e))}`);
  }
  revalidatePath("/officers");
  redirect(`/officers?notice=${decision === "approve" ? "grant-approved" : "grant-rejected"}`);
}

export async function inviteMemberAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ws = await requireWorkspace();
  const memberId = text(formData, "memberId");
  const email = text(formData, "email");
  try {
    const { token } = await inSociety(ws, (tx) => inviteMember(tx, ws.actor, memberId, email));
    const link = `${appUrl()}/invite/${token}`;
    const { delivered } = await sendMail(mails.memberInvite(email.toLowerCase(), ws.society.societyName, link));
    revalidatePath(`/members/${memberId}`);
    return { ok: true, email: email.toLowerCase(), link, delivered };
  } catch (e) {
    return { ok: false, message: describe(e) };
  }
}
