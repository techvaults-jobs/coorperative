/**
 * Closing a financial year: the year's income and expenses are closed into 3400 Accumulated
 * surplus, and 25% of a surplus is transferred to the statutory reserve (Co-operative Societies
 * Act s.34, D-006). One closing entry, approved by a second officer; once it posts, the year is
 * locked. Other appropriations (education fund, dividends, bonuses) are decided at the AGM.
 */
import { can, kobo, type JournalLine, type Kobo } from "@techvaults/core";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { financialYears, ledgerAccounts, societies } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError, submitJournalEntry, type Actor } from "./ledger.js";

export class YearEndError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YearEndError";
  }
}

export const ACCUMULATED_SURPLUS_CODE = "3400";
export const STATUTORY_RESERVE_CODE = "3200";

/** The financial year ending on or before `asOf` most recently, for a year starting in `startMonth`. */
export function lastCompletedYear(asOf: string, startMonth: number): { start: string; end: string } {
  const [y, m] = asOf.split("-").map(Number) as [number, number];
  // The current year started in startMonth of this year or last year; the completed one before it.
  const currentStartYear = m >= startMonth ? y : y - 1;
  const start = new Date(Date.UTC(currentStartYear - 1, startMonth - 1, 1));
  const end = new Date(Date.UTC(currentStartYear, startMonth - 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export interface YearEndPreview {
  start: string;
  end: string;
  lines: { code: string; name: string; class: "income" | "expense"; amount: Kobo }[];
  income: Kobo;
  expenses: Kobo;
  surplus: Kobo;
  statutoryReserve: Kobo;
  status: "open" | "closing" | "closed";
}

const mayClose = (actor: Actor) => can(actor.roles, "accounts.manage") || can(actor.roles, "ledger.prepare");

export async function previewYearEnd(tx: Tx, actor: Actor, year: { start: string; end: string }): Promise<YearEndPreview> {
  if (!mayClose(actor)) throw new PermissionError("Your role cannot close the year");
  const [existing] = await tx
    .select()
    .from(financialYears)
    .where(and(eq(financialYears.societyId, actor.societyId), eq(financialYears.endDate, year.end), sql`${financialYears.status} <> 'abandoned'`));
  const rows = await tx.execute<{ code: string; name: string; class: "income" | "expense"; net: string }>(sql`
    select a.code, a.name, a.class, coalesce(sum(case when l.side = 'credit' then l.amount else -l.amount end), 0)::text as net
    from ledger_accounts a
    join journal_lines l on l.account_id = a.id
    join journal_entries e on e.id = l.entry_id
    where a.society_id = ${actor.societyId} and a.class in ('income', 'expense')
      and e.entry_date between ${year.start}::date and ${year.end}::date and e.kind <> 'closing'
    group by a.id order by a.code
  `);
  const lines = rows
    .map((r) => ({ code: r.code, name: r.name, class: r.class, amount: kobo(r.class === "income" ? BigInt(r.net) : -BigInt(r.net)) }))
    .filter((l) => l.amount !== 0n);
  const income = kobo(lines.filter((l) => l.class === "income").reduce((s, l) => s + l.amount, 0n));
  const expenses = kobo(lines.filter((l) => l.class === "expense").reduce((s, l) => s + l.amount, 0n));
  const surplus = kobo(income - expenses);
  return {
    ...year,
    lines,
    income,
    expenses,
    surplus,
    statutoryReserve: kobo(surplus > 0n ? (surplus * 25n + 50n) / 100n : 0n),
    status: existing ? (existing.status as "closing" | "closed") : "open",
  };
}

async function account(tx: Tx, actor: Actor, code: string, name: string) {
  const [a] = await tx.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.societyId, actor.societyId), eq(ledgerAccounts.code, code)));
  if (a) return a;
  const [row] = await tx.insert(ledgerAccounts).values({ societyId: actor.societyId, code, name, class: "equity" }).returning();
  return row!;
}

/** Prepare the closing entry for a year. Another officer approves it; the year locks when it posts. */
export async function submitYearEnd(tx: Tx, actor: Actor, year: { start: string; end: string }): Promise<{ submissionId: string; preview: YearEndPreview }> {
  const preview = await previewYearEnd(tx, actor, year);
  if (preview.status !== "open") throw new YearEndError(preview.status === "closed" ? "That year is already closed." : "That year's closing entry is already waiting for approval.");
  if (preview.lines.length === 0) throw new YearEndError("There's no income or expenditure in that year to close.");
  const accounts = new Map((await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.societyId, actor.societyId))).map((a) => [a.code, a]));
  const surplusAcct = await account(tx, actor, ACCUMULATED_SURPLUS_CODE, "Accumulated surplus");
  const reserveAcct = await account(tx, actor, STATUTORY_RESERVE_CODE, "Statutory reserve fund (Act s.34)");
  const lines: JournalLine[] = [];
  for (const l of preview.lines) {
    const id = accounts.get(l.code)!.id;
    // Bring each account to zero: income normally has a credit balance, so debit it; expenses the reverse.
    const side: JournalLine["side"] = (l.class === "income") === l.amount > 0n ? "debit" : "credit";
    lines.push({ accountId: id, side, amount: kobo(l.amount < 0n ? -l.amount : l.amount), memo: "Year-end close" });
  }
  const toSurplus = preview.surplus - preview.statutoryReserve;
  if (toSurplus !== 0n) lines.push({ accountId: surplusAcct.id, side: toSurplus > 0n ? "credit" : "debit", amount: kobo(toSurplus > 0n ? toSurplus : -toSurplus), memo: "Result for the year" });
  if (preview.statutoryReserve > 0n) lines.push({ accountId: reserveAcct.id, side: "credit", amount: preview.statutoryReserve, memo: "25% to statutory reserve (Act s.34)" });
  const submission = await submitJournalEntry(tx, actor, {
    entryDate: year.end,
    description: `Year-end close ${year.start} to ${year.end}`,
    idempotencyKey: `year-end:${year.end}:${Date.now()}`,
    kind: "closing",
    lines,
  });
  const [society] = await tx.select({ id: societies.id }).from(societies).where(eq(societies.id, actor.societyId));
  await tx.insert(financialYears).values({
    societyId: society!.id,
    startDate: year.start,
    endDate: year.end,
    surplus: preview.surplus,
    statutoryReserve: preview.statutoryReserve,
    submissionId: submission.id,
    closedBy: actor.userId,
  });
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "year.close_prepared",
    entityType: "financial_year",
    entityId: year.end,
    after: { start: year.start, end: year.end, surplus: preview.surplus, statutoryReserve: preview.statutoryReserve, submissionId: submission.id },
  });
  return { submissionId: submission.id, preview };
}

export async function listClosedYears(tx: Tx, actor: Actor) {
  return tx.select().from(financialYears).where(eq(financialYears.societyId, actor.societyId)).orderBy(desc(financialYears.endDate));
}
