import {
  balance,
  can,
  canApprove,
  kobo,
  LedgerError,
  reversalOf,
  validateEntry,
  type JournalEntryDraft,
  type JournalLine,
  type Kobo,
  type Role,
} from "@techvaults/core";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { journalEntries, journalLines, journalSubmissions, ledgerAccounts, members } from "../schema.js";
import { recordAudit } from "./audit.js";

export interface Actor {
  userId: string;
  societyId: string;
  roles: Role[];
  /** Set when the person is also a member using the portal: the member record they are. */
  memberId?: string | null;
}

/** True when the actor is the member in question, acting for themselves through the portal. */
export function isSelf(actor: Actor, memberId: string): boolean {
  return !!actor.memberId && actor.memberId === memberId && can(actor.roles, "self.read");
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export interface Submission {
  id: string;
  status: SubmissionStatus;
  /** False when the idempotency key had already been used and the earlier submission was returned. */
  created: boolean;
}

export interface PostedEntry {
  id: string;
  entryNo: bigint;
}

type SubmissionStatus = (typeof journalSubmissions.$inferSelect)["status"];
type EntryDraft = Omit<JournalEntryDraft, "societyId"> & { kind?: "standard" | "closing" };

/**
 * Submit a balanced journal entry for approval. Nothing reaches the ledger until a second
 * officer approves it. Submission is idempotent on (society, idempotencyKey): a retried
 * request returns the original submission instead of creating another.
 */
export async function submitJournalEntry(tx: Tx, actor: Actor, draft: EntryDraft): Promise<Submission> {
  if (!can(actor.roles, "ledger.prepare")) throw new PermissionError("Your role cannot prepare journal entries");
  return insertSubmission(tx, actor, draft);
}

async function insertSubmission(tx: Tx, actor: Actor, draft: EntryDraft & { reversesEntryId?: string }): Promise<Submission> {
  const entry: JournalEntryDraft = { ...draft, societyId: actor.societyId };
  validateEntry(entry);
  if ((draft.kind ?? "standard") !== "closing") {
    const [closed] = await tx.execute<{ end_date: string }>(
      sql`select end_date::text from financial_years where society_id = ${actor.societyId} and status = 'closed' and end_date >= ${entry.entryDate}::date limit 1`,
    );
    if (closed) throw new LedgerError("INVALID_DATE", `The books are closed up to ${closed.end_date}. Date the entry in an open year.`);
  }
  await checkAccounts(tx, entry.lines);

  const inserted = await tx
    .insert(journalSubmissions)
    .values({
      societyId: actor.societyId,
      entryDate: entry.entryDate,
      description: entry.description,
      idempotencyKey: entry.idempotencyKey,
      lines: entry.lines.map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amount: l.amount.toString(),
        ...(l.memberId ? { memberId: l.memberId } : {}),
        ...(l.loanId ? { loanId: l.loanId } : {}),
        ...(l.memo ? { memo: l.memo } : {}),
      })),
      reversesEntryId: draft.reversesEntryId ?? null,
      kind: draft.kind ?? "standard",
      preparedBy: actor.userId,
    })
    .onConflictDoNothing({ target: [journalSubmissions.societyId, journalSubmissions.idempotencyKey] })
    .returning({ id: journalSubmissions.id, status: journalSubmissions.status });

  if (inserted.length === 0) {
    const [existing] = await tx
      .select({ id: journalSubmissions.id, status: journalSubmissions.status })
      .from(journalSubmissions)
      .where(and(eq(journalSubmissions.societyId, actor.societyId), eq(journalSubmissions.idempotencyKey, entry.idempotencyKey)));
    return { ...existing!, created: false };
  }
  const submission = inserted[0]!;
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: draft.reversesEntryId ? "journal.reversal_requested" : "journal.submitted",
    entityType: "journal_submission",
    entityId: submission.id,
    after: { description: entry.description, entryDate: entry.entryDate, lines: entry.lines, reversesEntryId: draft.reversesEntryId },
  });
  return { ...submission, created: true };
}

/** Fail at submission, not at approval, when a line names the wrong kind of account. */
async function checkAccounts(tx: Tx, lines: readonly JournalLine[]): Promise<void> {
  const ids = [...new Set(lines.map((l) => l.accountId))];
  const found = await tx.select().from(ledgerAccounts).where(inArray(ledgerAccounts.id, ids));
  const byId = new Map(found.map((a) => [a.id, a]));
  for (const line of lines) {
    const account = byId.get(line.accountId);
    if (!account || !account.isActive) throw new LedgerError("UNBALANCED", "Choose active accounts from the society's chart of accounts.");
    if (account.isMemberControl !== !!line.memberId) {
      throw new LedgerError(
        "UNBALANCED",
        account.isMemberControl ? `${account.code} ${account.name} is a member account, so the line must name a member.` : `${account.code} ${account.name} is not a member account, so the line must not name a member.`,
      );
    }
  }
}

/** Ask for a posted entry to be reversed. The reversal is posted only when a second officer approves it. */
export async function requestReversal(
  tx: Tx,
  actor: Actor,
  entryId: string,
  opts: { entryDate: string; reason: string; idempotencyKey: string },
): Promise<Submission> {
  if (!can(actor.roles, "ledger.reverse")) throw new PermissionError("Your role cannot reverse journal entries");
  if (!opts.reason.trim()) throw new Error("A reversal needs a reason");
  const [original] = await tx.select().from(journalEntries).where(eq(journalEntries.id, entryId));
  if (!original) throw new Error(`Journal entry ${entryId} not found`);
  if (original.reversesEntryId) throw new LedgerError("UNBALANCED", "A reversal can't itself be reversed. Post a new entry instead.");
  const [already] = await tx.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.reversesEntryId, entryId));
  if (already) throw new LedgerError("UNBALANCED", `Entry #${original.entryNo} has already been reversed.`);
  const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, entryId)).orderBy(asc(journalLines.id));
  const reversal = reversalOf(
    {
      id: original.id,
      societyId: original.societyId,
      entryDate: original.entryDate,
      description: original.description,
      idempotencyKey: original.idempotencyKey,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amount: kobo(l.amount),
        ...(l.memberId ? { memberId: l.memberId } : {}),
        ...(l.loanId ? { loanId: l.loanId } : {}),
        ...(l.memo ? { memo: l.memo } : {}),
      })),
      ...(original.policyVersionId ? { policyVersionId: original.policyVersionId } : {}),
    },
    { ...opts, reference: `#${original.entryNo}` },
  );
  try {
    return await insertSubmission(tx, actor, reversal);
  } catch (e) {
    if ((e as { cause?: { constraint_name?: string } }).cause?.constraint_name === "journal_submissions_pending_reversal") {
      throw new LedgerError("UNBALANCED", `A reversal of entry #${original.entryNo} is already waiting for approval.`);
    }
    throw e;
  }
}

async function lockPending(tx: Tx, submissionId: string) {
  const [submission] = await tx.select().from(journalSubmissions).where(eq(journalSubmissions.id, submissionId)).for("update");
  if (!submission) throw new Error(`Submission ${submissionId} not found`);
  if (submission.status !== "pending") throw new LedgerError("UNBALANCED", `This entry was already ${submission.status}.`);
  return submission;
}

function checkApprover(actor: Actor, submission: { preparedBy: string }) {
  const check = canApprove(actor, submission, "ledger.approve");
  if (!check.allowed) throw new PermissionError(check.reason);
}

/** Approve a pending submission and post it to the journal, numbered next in the society's sequence. */
export async function approveSubmission(tx: Tx, actor: Actor, submissionId: string): Promise<PostedEntry> {
  const submission = await lockPending(tx, submissionId);
  checkApprover(actor, submission);
  await tx
    .update(journalSubmissions)
    .set({ status: "approved", decidedBy: actor.userId, decidedAt: new Date() })
    .where(eq(journalSubmissions.id, submissionId));
  const [posted] = await tx
    .insert(journalEntries)
    .values({
      societyId: actor.societyId,
      entryDate: submission.entryDate,
      description: submission.description,
      idempotencyKey: submission.idempotencyKey,
      reversesEntryId: submission.reversesEntryId,
      submissionId: submission.id,
      kind: submission.kind,
      preparedBy: submission.preparedBy,
      postedBy: actor.userId,
    })
    .returning({ id: journalEntries.id, entryNo: journalEntries.entryNo });
  await tx.insert(journalLines).values(
    submission.lines.map((line) => ({
      societyId: actor.societyId,
      entryId: posted!.id,
      accountId: line.accountId,
      memberId: line.memberId ?? null,
      loanId: line.loanId ?? null,
      side: line.side,
      amount: BigInt(line.amount),
      memo: line.memo ?? null,
    })),
  );
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: submission.reversesEntryId ? "journal.reversed" : "journal.posted",
    entityType: "journal_entry",
    entityId: posted!.id,
    after: {
      entryNo: posted!.entryNo,
      submissionId: submission.id,
      preparedBy: submission.preparedBy,
      description: submission.description,
      entryDate: submission.entryDate,
      lines: submission.lines,
    },
  });
  await settleLoans(tx, submission.id, submission.lines);
  return posted!;
}

/**
 * Keep loan status in step with the ledger: a loan whose disbursement is posted becomes
 * active, and an active loan whose principal is fully repaid closes.
 */
async function settleLoans(tx: Tx, submissionId: string, lines: { loanId?: string }[]) {
  await tx.execute(sql`update loans set status = 'active' where disbursement_submission_id = ${submissionId} and status = 'disbursing'`);
  await tx.execute(sql`update payroll_runs set status = 'posted' where submission_id = ${submissionId} and status = 'submitted'`);
  await tx.execute(sql`update collection_sheets set status = 'posted' where submission_id = ${submissionId} and status = 'submitted'`);
  await tx.execute(sql`update withdrawals set status = 'paid' where payment_submission_id = ${submissionId} and status = 'paying'`);
  await tx.execute(sql`update financial_years set status = 'closed' where submission_id = ${submissionId} and status = 'closing'`);
  const loanIds = [...new Set(lines.flatMap((l) => (l.loanId ? [l.loanId] : [])))];
  if (loanIds.length === 0) return;
  await tx.execute(sql`
    update loans set status = 'closed', closed_at = now()
    where id in ${loanIds} and status = 'active'
      and (select coalesce(sum(case l.side when 'debit' then l.amount else -l.amount end), 0)
           from journal_lines l join products p on p.account_id = l.account_id
           where l.loan_id = loans.id and p.id = loans.product_id) <= 0
  `);
}

/** Send a submission back to its preparer with a reason. Nothing is posted. */
export async function rejectSubmission(tx: Tx, actor: Actor, submissionId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("A rejection needs a reason");
  const submission = await lockPending(tx, submissionId);
  checkApprover(actor, submission);
  await decide(tx, actor, submissionId, "rejected", reason);
}

/** The preparer takes back a submission that hasn't been decided yet. */
export async function withdrawSubmission(tx: Tx, actor: Actor, submissionId: string): Promise<void> {
  const submission = await lockPending(tx, submissionId);
  if (submission.preparedBy !== actor.userId) throw new PermissionError("Only the person who prepared this entry can withdraw it");
  await decide(tx, actor, submissionId, "withdrawn", null);
}

async function decide(tx: Tx, actor: Actor, submissionId: string, status: "rejected" | "withdrawn", reason: string | null) {
  await tx
    .update(journalSubmissions)
    .set({ status, decidedBy: actor.userId, decidedAt: new Date(), decisionReason: reason })
    .where(eq(journalSubmissions.id, submissionId));
  // A year-end close that was turned down is abandoned; the year can be closed again.
  await tx.execute(sql`update financial_years set status = 'abandoned' where submission_id = ${submissionId} and status = 'closing'`);
  // A withdrawal whose payment was turned down can be paid again.
  await tx.execute(sql`update withdrawals set status = 'approved', payment_submission_id = null where payment_submission_id = ${submissionId} and status = 'paying'`);
  // A payroll run whose posting was turned down goes back to reconciled, to fix and resubmit.
  await tx.execute(sql`update payroll_runs set status = 'reconciled', submission_id = null where submission_id = ${submissionId} and status = 'submitted'`);
  // A collection sheet whose posting was turned down goes back to draft, to correct and resubmit.
  await tx.execute(sql`update collection_sheets set status = 'draft', submission_id = null where submission_id = ${submissionId} and status = 'submitted'`);
  // A loan whose disbursement was turned down can be disbursed again.
  await tx.execute(sql`
    update loans set status = 'approved', disbursement_submission_id = null, disbursed_on = null, first_due_date = null
    where disbursement_submission_id = ${submissionId} and status = 'disbursing'
  `);
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: `journal.${status}`,
    entityType: "journal_submission",
    entityId: submissionId,
    ...(reason ? { reason } : {}),
  });
}

/** Number of posted entries in the society in scope. */
export async function countJournal(tx: Tx, actor: Actor): Promise<number> {
  if (!can(actor.roles, "ledger.read")) throw new PermissionError("Your role cannot view the ledger");
  const [row] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from journal_entries`);
  return Number(row?.n ?? 0);
}

export interface SubmissionView {
  id: string;
  status: SubmissionStatus;
  entryDate: string;
  description: string;
  reversesEntryId: string | null;
  preparedBy: string;
  preparedByName: string;
  preparedAt: Date;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  entryNo: bigint | null;
  lines: JournalView["lines"];
}

/** Submissions for the society in scope: pending ones oldest first, then recent decisions. */
export async function listSubmissions(
  tx: Tx,
  actor: Actor,
  opts: { status?: SubmissionStatus; limit?: number } = {},
): Promise<SubmissionView[]> {
  if (!(["ledger.read", "ledger.prepare", "ledger.approve"] as const).some((p) => can(actor.roles, p))) {
    throw new PermissionError("Your role cannot view the ledger");
  }
  const rows = await tx.execute<{
    id: string;
    status: SubmissionStatus;
    entry_date: string;
    description: string;
    reverses_entry_id: string | null;
    lines: (typeof journalSubmissions.$inferSelect)["lines"];
    prepared_by: string;
    prepared_by_name: string;
    prepared_at: string;
    decided_by_name: string | null;
    decided_at: string | null;
    decision_reason: string | null;
    entry_no: string | null;
  }>(sql`
    select s.id, s.status, s.entry_date::text, s.description, s.reverses_entry_id, s.lines, s.prepared_by,
           p.name as prepared_by_name, s.prepared_at, d.name as decided_by_name, s.decided_at, s.decision_reason,
           e.entry_no
    from journal_submissions s
    join users p on p.id = s.prepared_by
    left join users d on d.id = s.decided_by
    left join journal_entries e on e.submission_id = s.id
    where ${opts.status ? sql`s.status = ${opts.status}` : sql`true`}
    order by (s.status = 'pending') desc,
             case when s.status = 'pending' then s.prepared_at end asc,
             coalesce(s.decided_at, s.prepared_at) desc
    limit ${Math.min(opts.limit ?? 100, 200)}
  `);
  if (rows.length === 0) return [];
  const accountIds = [...new Set(rows.flatMap((r) => r.lines.map((l) => l.accountId)))];
  const memberIds = [...new Set(rows.flatMap((r) => r.lines.flatMap((l) => (l.memberId ? [l.memberId] : []))))];
  const accounts = new Map((await tx.select().from(ledgerAccounts).where(inArray(ledgerAccounts.id, accountIds))).map((a) => [a.id, a]));
  const people = memberIds.length
    ? new Map((await tx.select().from(members).where(inArray(members.id, memberIds))).map((m) => [m.id, m]))
    : new Map<string, typeof members.$inferSelect>();
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    entryDate: r.entry_date,
    description: r.description,
    reversesEntryId: r.reverses_entry_id,
    preparedBy: r.prepared_by,
    preparedByName: r.prepared_by_name,
    preparedAt: new Date(r.prepared_at),
    decidedByName: r.decided_by_name,
    decidedAt: r.decided_at ? new Date(r.decided_at) : null,
    decisionReason: r.decision_reason,
    entryNo: r.entry_no === null ? null : BigInt(r.entry_no),
    lines: r.lines.map((l) => {
      const account = accounts.get(l.accountId);
      const member = l.memberId ? people.get(l.memberId) : undefined;
      return {
        accountCode: account?.code ?? "?",
        accountName: account?.name ?? "Unknown account",
        memberNo: member?.memberNo ?? null,
        memberName: member?.fullName ?? null,
        side: l.side,
        amount: kobo(BigInt(l.amount)),
      };
    }),
  }));
}

/** Entries with a reversal waiting for approval, so the journal can show them as such. */
export async function pendingReversalTargets(tx: Tx): Promise<Set<string>> {
  const rows = await tx
    .select({ id: journalSubmissions.reversesEntryId })
    .from(journalSubmissions)
    .where(and(eq(journalSubmissions.status, "pending"), isNotNull(journalSubmissions.reversesEntryId)));
  return new Set(rows.map((r) => r.id!));
}

export interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  class: (typeof ledgerAccounts.$inferSelect)["class"];
  debit: Kobo;
  credit: Kobo;
  balance: Kobo;
}

/** Trial balance for the society in scope. Total debits always equal total credits. */
export async function trialBalance(tx: Tx): Promise<AccountBalance[]> {
  const rows = await tx
    .select({
      accountId: ledgerAccounts.id,
      code: ledgerAccounts.code,
      name: ledgerAccounts.name,
      class: ledgerAccounts.class,
      debit: sql<string>`coalesce(sum(${journalLines.amount}) filter (where ${journalLines.side} = 'debit'), 0)`,
      credit: sql<string>`coalesce(sum(${journalLines.amount}) filter (where ${journalLines.side} = 'credit'), 0)`,
    })
    .from(ledgerAccounts)
    .leftJoin(journalLines, eq(journalLines.accountId, ledgerAccounts.id))
    .groupBy(ledgerAccounts.id)
    .orderBy(asc(ledgerAccounts.code));
  return rows.map((r) => {
    const debit = kobo(BigInt(r.debit));
    const credit = kobo(BigInt(r.credit));
    return {
      ...r,
      debit,
      credit,
      balance: balance(r.class, [
        { side: "debit", amount: debit },
        { side: "credit", amount: credit },
      ]),
    };
  });
}

/** A member's balance on each member control account (savings, shares, loans). */
export async function memberBalances(tx: Tx, memberId: string): Promise<Omit<AccountBalance, "accountId">[]> {
  const rows = await tx
    .select({
      code: ledgerAccounts.code,
      name: ledgerAccounts.name,
      class: ledgerAccounts.class,
      debit: sql<string>`coalesce(sum(${journalLines.amount}) filter (where ${journalLines.side} = 'debit'), 0)`,
      credit: sql<string>`coalesce(sum(${journalLines.amount}) filter (where ${journalLines.side} = 'credit'), 0)`,
    })
    .from(journalLines)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
    .where(eq(journalLines.memberId, memberId))
    .groupBy(ledgerAccounts.id)
    .orderBy(asc(ledgerAccounts.code));
  return rows.map((r) => {
    const debit = kobo(BigInt(r.debit));
    const credit = kobo(BigInt(r.credit));
    return { ...r, debit, credit, balance: balance(r.class, [{ side: "debit", amount: debit }, { side: "credit", amount: credit }]) };
  });
}

export type LedgerAccount = typeof ledgerAccounts.$inferSelect;

export async function listAccounts(tx: Tx, actor: Actor): Promise<LedgerAccount[]> {
  if (!can(actor.roles, "ledger.read")) throw new PermissionError("Your role cannot view the ledger");
  return tx.select().from(ledgerAccounts).orderBy(asc(ledgerAccounts.code));
}

export interface JournalView {
  id: string;
  entryNo: bigint;
  entryDate: string;
  description: string;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  postedAt: Date;
  /** The approver. */
  postedByName: string;
  preparedByName: string;
  lines: { accountCode: string; accountName: string; memberNo: string | null; memberName: string | null; side: "debit" | "credit"; amount: Kobo }[];
}

/** Most recent journal entries with their lines, newest first. */
export async function listJournal(tx: Tx, actor: Actor, opts: { limit?: number; offset?: number; memberId?: string } = {}): Promise<JournalView[]> {
  if (!can(actor.roles, "ledger.read") && !(opts.memberId && isSelf(actor, opts.memberId))) throw new PermissionError("Your role cannot view the ledger");
  const limit = Math.min(opts.limit ?? 50, 200);
  const entries = await tx.execute<{
    id: string;
    entry_no: string;
    entry_date: string;
    description: string;
    reverses_entry_id: string | null;
    reversed_by: string | null;
    posted_at: string;
    posted_by_name: string;
    prepared_by_name: string;
  }>(sql`
    select e.id, e.entry_no, e.entry_date::text, e.description, e.reverses_entry_id,
           r.id as reversed_by, e.posted_at, u.name as posted_by_name, p.name as prepared_by_name
    from journal_entries e
    join users u on u.id = e.posted_by
    join users p on p.id = e.prepared_by
    left join journal_entries r on r.reverses_entry_id = e.id
    where ${opts.memberId ? sql`exists (select 1 from journal_lines l where l.entry_id = e.id and l.member_id = ${opts.memberId})` : sql`true`}
    order by e.entry_no desc
    limit ${limit} offset ${Math.max(0, Math.floor(opts.offset ?? 0))}
  `);
  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.id);
  const lines = await tx.execute<{
    entry_id: string;
    code: string;
    name: string;
    member_no: string | null;
    full_name: string | null;
    side: "debit" | "credit";
    amount: string;
  }>(sql`
    select l.entry_id, a.code, a.name, m.member_no, m.full_name, l.side, l.amount
    from journal_lines l
    join ledger_accounts a on a.id = l.account_id
    left join members m on m.id = l.member_id
    where l.entry_id in ${ids}
    order by l.id
  `);
  return entries.map((e) => ({
    id: e.id,
    entryNo: BigInt(e.entry_no),
    entryDate: e.entry_date,
    description: e.description,
    reversesEntryId: e.reverses_entry_id,
    reversedByEntryId: e.reversed_by,
    postedAt: new Date(e.posted_at),
    postedByName: e.posted_by_name,
    preparedByName: e.prepared_by_name,
    lines: lines
      .filter((l) => l.entry_id === e.id)
      .map((l) => ({
        accountCode: l.code,
        accountName: l.name,
        memberNo: l.member_no,
        memberName: l.full_name,
        side: l.side,
        amount: kobo(BigInt(l.amount)),
      })),
  }));
}
