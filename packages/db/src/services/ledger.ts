import {
  balance,
  can,
  kobo,
  reversalOf,
  validateEntry,
  type JournalEntryDraft,
  type Kobo,
  type Role,
} from "@techvaults/core";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { journalEntries, journalLines, ledgerAccounts } from "../schema.js";
import { recordAudit } from "./audit.js";

export interface Actor {
  userId: string;
  societyId: string;
  roles: Role[];
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export interface PostedEntry {
  id: string;
  entryNo: bigint;
  /** False when the idempotency key had already been used and the earlier entry was returned. */
  created: boolean;
}

/**
 * Post a balanced journal entry. Posting is idempotent on (society, idempotencyKey):
 * a retried request returns the original entry instead of posting twice.
 */
export async function postJournalEntry(
  tx: Tx,
  actor: Actor,
  draft: Omit<JournalEntryDraft, "societyId"> & { reversesEntryId?: string },
): Promise<PostedEntry> {
  if (!can(actor.roles, "ledger.post")) throw new PermissionError("Your role cannot post journal entries");
  const entry: JournalEntryDraft = { ...draft, societyId: actor.societyId };
  validateEntry(entry);

  const inserted = await tx
    .insert(journalEntries)
    .values({
      societyId: actor.societyId,
      entryDate: entry.entryDate,
      description: entry.description,
      idempotencyKey: entry.idempotencyKey,
      reversesEntryId: draft.reversesEntryId ?? null,
      policyVersionId: entry.policyVersionId ?? null,
      preparedBy: actor.userId,
      postedBy: actor.userId,
    })
    .onConflictDoNothing({ target: [journalEntries.societyId, journalEntries.idempotencyKey] })
    .returning({ id: journalEntries.id, entryNo: journalEntries.entryNo });

  if (inserted.length === 0) {
    const [existing] = await tx
      .select({ id: journalEntries.id, entryNo: journalEntries.entryNo })
      .from(journalEntries)
      .where(and(eq(journalEntries.societyId, actor.societyId), eq(journalEntries.idempotencyKey, entry.idempotencyKey)));
    return { ...existing!, created: false };
  }

  const posted = inserted[0]!;
  await tx.insert(journalLines).values(
    entry.lines.map((line) => ({
      societyId: actor.societyId,
      entryId: posted.id,
      accountId: line.accountId,
      memberId: line.memberId ?? null,
      side: line.side,
      amount: line.amount,
      memo: line.memo ?? null,
    })),
  );
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: draft.reversesEntryId ? "journal.reversed" : "journal.posted",
    entityType: "journal_entry",
    entityId: posted.id,
    after: { description: entry.description, entryDate: entry.entryDate, lines: entry.lines },
  });
  return { ...posted, created: true };
}

/** Reverse a posted entry by posting its mirror image. The original is never changed. */
export async function reverseJournalEntry(
  tx: Tx,
  actor: Actor,
  entryId: string,
  opts: { entryDate: string; reason: string; idempotencyKey: string },
): Promise<PostedEntry> {
  if (!can(actor.roles, "ledger.reverse")) throw new PermissionError("Your role cannot reverse journal entries");
  if (!opts.reason.trim()) throw new Error("A reversal needs a reason");
  const [original] = await tx.select().from(journalEntries).where(eq(journalEntries.id, entryId));
  if (!original) throw new Error(`Journal entry ${entryId} not found`);
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
        ...(l.memo ? { memo: l.memo } : {}),
      })),
      ...(original.policyVersionId ? { policyVersionId: original.policyVersionId } : {}),
    },
    { ...opts, reference: `#${original.entryNo}` },
  );
  return postJournalEntry(tx, actor, reversal);
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
  postedByName: string;
  lines: { accountCode: string; accountName: string; memberNo: string | null; memberName: string | null; side: "debit" | "credit"; amount: Kobo }[];
}

/** Most recent journal entries with their lines, newest first. */
export async function listJournal(tx: Tx, actor: Actor, opts: { limit?: number; memberId?: string } = {}): Promise<JournalView[]> {
  if (!can(actor.roles, "ledger.read") && !opts.memberId) throw new PermissionError("Your role cannot view the ledger");
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
  }>(sql`
    select e.id, e.entry_no, e.entry_date::text, e.description, e.reverses_entry_id,
           r.id as reversed_by, e.posted_at, u.name as posted_by_name
    from journal_entries e
    join users u on u.id = e.posted_by
    left join journal_entries r on r.reverses_entry_id = e.id
    where ${opts.memberId ? sql`exists (select 1 from journal_lines l where l.entry_id = e.id and l.member_id = ${opts.memberId})` : sql`true`}
    order by e.entry_no desc
    limit ${limit}
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
