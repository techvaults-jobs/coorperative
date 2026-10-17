/**
 * Double-entry journal rules, independent of storage.
 *
 * A journal entry is valid only if it has at least two lines, every line moves a
 * positive amount on exactly one side, and total debits equal total credits.
 * Posted entries are never edited or deleted: a mistake is corrected by posting a
 * reversal that mirrors the original, linked to it, with its own reason.
 */
import { add, type Kobo } from "./money.js";

export type AccountClass = "asset" | "liability" | "equity" | "income" | "expense";

/** Accounts whose balance normally sits on the debit side. */
export function isDebitNormal(accountClass: AccountClass): boolean {
  return accountClass === "asset" || accountClass === "expense";
}

export type Side = "debit" | "credit";

export interface JournalLine {
  accountId: string;
  side: Side;
  amount: Kobo;
  /** Member sub-ledger the line belongs to, when the account is a member control account. */
  memberId?: string;
  memo?: string;
}

export interface JournalEntryDraft {
  societyId: string;
  /** Accounting date (YYYY-MM-DD) – the period the entry belongs to. */
  entryDate: string;
  description: string;
  /** Caller-supplied key; the same key twice must not post twice. */
  idempotencyKey: string;
  lines: JournalLine[];
  /** Policy version that produced this entry, when a configured policy was applied. */
  policyVersionId?: string;
}

export type LedgerErrorCode =
  | "TOO_FEW_LINES"
  | "NON_POSITIVE_AMOUNT"
  | "UNBALANCED"
  | "MISSING_IDEMPOTENCY_KEY"
  | "INVALID_DATE"
  | "MISSING_DESCRIPTION";

export class LedgerError extends Error {
  constructor(
    readonly code: LedgerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

export function totals(lines: readonly JournalLine[]): { debit: Kobo; credit: Kobo } {
  return {
    debit: add(...lines.filter((l) => l.side === "debit").map((l) => l.amount)),
    credit: add(...lines.filter((l) => l.side === "credit").map((l) => l.amount)),
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateEntry(entry: JournalEntryDraft): void {
  if (!entry.idempotencyKey.trim()) {
    throw new LedgerError("MISSING_IDEMPOTENCY_KEY", "Every entry needs an idempotency key");
  }
  if (!entry.description.trim()) {
    throw new LedgerError("MISSING_DESCRIPTION", "Every entry needs a description");
  }
  if (!ISO_DATE.test(entry.entryDate) || Number.isNaN(Date.parse(`${entry.entryDate}T00:00:00Z`))) {
    throw new LedgerError("INVALID_DATE", `Entry date must be YYYY-MM-DD, got "${entry.entryDate}"`);
  }
  if (entry.lines.length < 2) {
    throw new LedgerError("TOO_FEW_LINES", "A journal entry needs at least two lines");
  }
  for (const line of entry.lines) {
    if (line.amount <= 0n) {
      throw new LedgerError(
        "NON_POSITIVE_AMOUNT",
        `Line on account ${line.accountId} must move a positive amount; use the other side instead of a negative`,
      );
    }
  }
  const { debit, credit } = totals(entry.lines);
  if (debit !== credit) {
    throw new LedgerError("UNBALANCED", `Debits (${debit}) do not equal credits (${credit})`);
  }
}

/** Build the reversal of a posted entry: same lines, sides swapped. */
export function reversalOf(
  original: JournalEntryDraft & { id: string },
  opts: { entryDate: string; reason: string; idempotencyKey: string },
): JournalEntryDraft & { reversesEntryId: string } {
  const reversal = {
    societyId: original.societyId,
    entryDate: opts.entryDate,
    description: `Reversal of ${original.id}: ${opts.reason}`,
    idempotencyKey: opts.idempotencyKey,
    reversesEntryId: original.id,
    lines: original.lines.map((line) => ({
      ...line,
      side: (line.side === "debit" ? "credit" : "debit") as Side,
    })),
    ...(original.policyVersionId ? { policyVersionId: original.policyVersionId } : {}),
  };
  validateEntry(reversal);
  return reversal;
}

/**
 * Signed balance of an account from its lines, positive on the account's normal side.
 * A savings (liability) account with a ₦5,000 credit returns 500000n.
 */
export function balance(accountClass: AccountClass, lines: readonly Pick<JournalLine, "side" | "amount">[]): Kobo {
  const { debit, credit } = totals(lines as JournalLine[]);
  return (isDebitNormal(accountClass) ? debit - credit : credit - debit) as Kobo;
}
