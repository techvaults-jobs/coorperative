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
    opts,
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
