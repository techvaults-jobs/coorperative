/**
 * Collection meetings (D-027), for societies that collect in person or by transfer.
 *
 *   draft → submitted → posted
 *
 * A sheet is opened for a meeting date on the society's meeting day, pre-filled with each
 * member's usual contributions and the loan repayments and interest due by that date. Officers
 * correct it to what was actually paid. The treasurer then enters what was received (cash
 * counted and transfers) and submits: one journal submission that another officer approves.
 * Money over or short against the sheet is held in suspense, with the explanation given.
 * Each column is kept as the member designated it (the workbook's practice; see 12 §12.6 Q2).
 */
import { can, checkCash, kobo, meetingDateProblem, WEEKDAYS, type CollectionKind, type JournalLine, type Kobo } from "@techvaults/core";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { collectionLines, collectionSheets, ledgerAccounts, loans, memberContributions, members, products, societies } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError, submitJournalEntry, type Actor } from "./ledger.js";
import { interestCreditAccount, loanIsFlexible, loanPosition } from "./loans.js";
import { SUSPENSE_CODE } from "./payroll.js";

export class CollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectionError";
  }
}

function requireCollections(actor: Actor) {
  if (!can(actor.roles, "collections.manage")) throw new PermissionError("Your role cannot record collections");
}

function canView(actor: Actor) {
  return can(actor.roles, "collections.manage") || can(actor.roles, "ledger.read");
}

const today = () => new Date().toISOString().slice(0, 10);
const naira = (k: bigint) => (Number(k) / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" });
const byCard = (a: { memberNo: string }, b: { memberNo: string }) => a.memberNo.localeCompare(b.memberNo, undefined, { numeric: true });

// ---------------------------------------------------------------------------
// Meeting day

export async function meetingWeekday(tx: Tx, actor: Actor): Promise<number | null> {
  const [row] = await tx.select({ day: societies.meetingWeekday }).from(societies).where(eq(societies.id, actor.societyId));
  return row?.day ?? null;
}

export async function setMeetingWeekday(tx: Tx, actor: Actor, day: number | null): Promise<void> {
  if (!can(actor.roles, "collections.manage") && !can(actor.roles, "settings.manage")) throw new PermissionError("Your role cannot change the meeting day");
  if (day !== null && !(Number.isInteger(day) && day >= 0 && day <= 6)) throw new CollectionError("Choose a day of the week.");
  const before = await meetingWeekday(tx, actor);
  await tx.update(societies).set({ meetingWeekday: day }).where(eq(societies.id, actor.societyId));
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "settings.meeting_day_changed",
    entityType: "society",
    entityId: actor.societyId,
    before: { meetingDay: before === null ? null : WEEKDAYS[before] },
    after: { meetingDay: day === null ? null : WEEKDAYS[day] },
  });
}

// ---------------------------------------------------------------------------
// Columns and rows

export interface CollectionColumn {
  /** A product id for savings and share columns; "loan" or "interest" for the loan columns. */
  key: string;
  kind: CollectionKind;
  label: string;
}

async function columnsFor(tx: Tx, actor: Actor): Promise<{ columns: CollectionColumn[]; productById: Map<string, typeof products.$inferSelect> }> {
  const rows = await tx
    .select()
    .from(products)
    .where(eq(products.societyId, actor.societyId))
    .orderBy(asc(products.kind), asc(products.code));
  const productById = new Map(rows.map((p) => [p.id, p]));
  const contributionProducts = rows.filter((p) => p.status === "active" && p.kind !== "loan");
  const columns: CollectionColumn[] = [
    ...contributionProducts.filter((p) => p.kind === "savings").map((p) => ({ key: p.id, kind: "savings" as const, label: p.name })),
    ...contributionProducts.filter((p) => p.kind === "shares").map((p) => ({ key: p.id, kind: "shares" as const, label: p.name })),
  ];
  if (rows.some((p) => p.kind === "loan")) columns.push({ key: "loan", kind: "loan", label: "Loan repayment" }, { key: "interest", kind: "interest", label: "Interest" });
  return { columns, productById };
}

type LoanRow = typeof loans.$inferSelect;

interface MemberLoan {
  loan: LoanRow;
  flexible: boolean;
  outstanding: Kobo;
  /**
   * What the sheet pre-fills in the Loan column. Scheduled loans: principal due by the meeting
   * date and not yet paid. Flexible loans: the expected weekly repayment.
   */
  principalDue: Kobo;
  /** Interest due by the meeting date and not yet paid (for flexible loans, charged and unpaid). */
  interestDue: Kobo;
}

/** Each member's oldest active loan, with what's due by `asOf`. One loan per row, as on the paper sheet. */
async function loansByMember(tx: Tx, actor: Actor, asOf: string): Promise<{ byMember: Map<string, MemberLoan>; others: number }> {
  const active = await tx
    .select()
    .from(loans)
    .where(and(eq(loans.societyId, actor.societyId), eq(loans.status, "active")))
    .orderBy(asc(loans.loanNo));
  const byMember = new Map<string, MemberLoan>();
  let others = 0;
  for (const loan of active) {
    if (byMember.has(loan.memberId)) {
      others++;
      continue;
    }
    const position = await loanPosition(tx, loan, asOf);
    const flexible = loanIsFlexible(loan);
    const due = (position.schedule?.instalments ?? []).filter((i) => i.dueDate <= asOf);
    const principalDue = flexible
      ? asOf >= (loan.firstDueDate ?? asOf) ? (position.weekly?.weekly ?? 0n) : 0n
      : due.reduce((s, i) => s + i.principal, 0n) - position.principalRepaid;
    byMember.set(loan.memberId, {
      loan,
      flexible,
      outstanding: position.principalOutstanding,
      principalDue: kobo(principalDue > 0n ? (principalDue < position.principalOutstanding ? principalDue : position.principalOutstanding) : 0n),
      interestDue: position.interestDue,
    });
  }
  return { byMember, others };
}

// ---------------------------------------------------------------------------
// Sheets

type SheetRow = typeof collectionSheets.$inferSelect;

async function lockSheet(tx: Tx, sheetId: string): Promise<SheetRow> {
  const [sheet] = await tx.select().from(collectionSheets).where(eq(collectionSheets.id, sheetId)).for("update");
  if (!sheet) throw new CollectionError("Collection sheet not found.");
  return sheet;
}

/** Open a meeting's sheet, pre-filled with usual contributions and what's due on loans. */
export async function createCollectionSheet(tx: Tx, actor: Actor, input: { meetingDate: string }): Promise<string> {
  requireCollections(actor);
  const problem = meetingDateProblem(input.meetingDate, await meetingWeekday(tx, actor), today());
  if (problem) throw new CollectionError(problem);
  const [existing] = await tx
    .select({ id: collectionSheets.id })
    .from(collectionSheets)
    .where(and(eq(collectionSheets.societyId, actor.societyId), eq(collectionSheets.meetingDate, input.meetingDate)));
  if (existing) throw new CollectionError(`There's already a sheet for ${input.meetingDate}.`);
  const [sheet] = await tx.insert(collectionSheets).values({ societyId: actor.societyId, meetingDate: input.meetingDate, createdBy: actor.userId }).returning();

  const usual = await tx
    .select({ memberId: memberContributions.memberId, productId: memberContributions.productId, kind: products.kind, amount: memberContributions.amount })
    .from(memberContributions)
    .innerJoin(products, eq(products.id, memberContributions.productId))
    .innerJoin(members, eq(members.id, memberContributions.memberId))
    .where(and(eq(memberContributions.societyId, actor.societyId), eq(members.status, "active"), eq(products.status, "active")));
  const rows: (typeof collectionLines.$inferInsert)[] = usual.map((c) => ({
    societyId: actor.societyId,
    sheetId: sheet!.id,
    memberId: c.memberId,
    kind: c.kind as "savings" | "shares",
    productId: c.productId,
    amount: c.amount,
  }));
  const { byMember } = await loansByMember(tx, actor, input.meetingDate);
  for (const [memberId, l] of byMember) {
    const base = { societyId: actor.societyId, sheetId: sheet!.id, memberId, productId: l.loan.productId, loanId: l.loan.id };
    if (l.principalDue > 0n) rows.push({ ...base, kind: "loan", amount: l.principalDue });
    if (l.interestDue > 0n) rows.push({ ...base, kind: "interest", amount: l.interestDue });
  }
  if (rows.length) await tx.insert(collectionLines).values(rows);
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "collection.opened",
    entityType: "collection_sheet",
    entityId: sheet!.id,
    after: { meetingDate: input.meetingDate, prefilledLines: rows.length },
  });
  return sheet!.id;
}

export interface CollectionRow {
  memberId: string;
  memberNo: string;
  name: string;
  /** Amount per column key. */
  amounts: Record<string, Kobo>;
  total: Kobo;
  loan: { id: string; loanNo: number; outstanding: Kobo; interestDue: Kobo } | null;
}

export interface CollectionSheetView {
  id: string;
  meetingDate: string;
  status: SheetRow["status"];
  columns: CollectionColumn[];
  rows: CollectionRow[];
  totals: Record<string, Kobo>;
  total: Kobo;
  paidMembers: number;
  cashCounted: Kobo | null;
  transfers: Kobo | null;
  lodgementRef: string | null;
  differenceNote: string | null;
  submissionId: string | null;
  /** Members with a second active loan, which the sheet doesn't show. */
  otherLoans: number;
}

/** The sheet as the meeting sees it: every active member in card order, plus anyone paid on it. */
export async function collectionSheet(tx: Tx, actor: Actor, sheetId: string): Promise<CollectionSheetView | undefined> {
  if (!canView(actor)) throw new PermissionError("Your role cannot view collections");
  const [sheet] = await tx.select().from(collectionSheets).where(eq(collectionSheets.id, sheetId));
  if (!sheet) return undefined;
  const { columns, productById } = await columnsFor(tx, actor);
  const lines = await tx.select().from(collectionLines).where(eq(collectionLines.sheetId, sheetId));
  const { byMember: loanOf, others } = await loansByMember(tx, actor, sheet.meetingDate);
  const lineMembers = [...new Set(lines.map((l) => l.memberId))];
  const people = await tx
    .select({ id: members.id, memberNo: members.memberNo, name: members.fullName, status: members.status })
    .from(members)
    .where(eq(members.societyId, actor.societyId));
  const shown = sheet.status === "draft" ? people.filter((p) => p.status === "active" || lineMembers.includes(p.id)) : people.filter((p) => lineMembers.includes(p.id));

  // Columns for products retired since the sheet was filled still show what was paid into them.
  for (const l of lines) {
    const key = keyOf(l);
    if (!columns.some((c) => c.key === key)) columns.push({ key, kind: l.kind, label: productById.get(l.productId)?.name ?? "Retired product" });
  }

  const rows: CollectionRow[] = shown
    .map((p) => {
      const mine = lines.filter((l) => l.memberId === p.id);
      const amounts: Record<string, Kobo> = {};
      for (const l of mine) amounts[keyOf(l)] = kobo((amounts[keyOf(l)] ?? 0n) + l.amount);
      const loan = loanOf.get(p.id);
      return {
        memberId: p.id,
        memberNo: p.memberNo,
        name: p.name,
        amounts,
        total: kobo(mine.reduce((s, l) => s + l.amount, 0n)),
        loan: loan ? { id: loan.loan.id, loanNo: loan.loan.loanNo, outstanding: loan.outstanding, interestDue: loan.interestDue } : null,
      };
    })
    .sort(byCard);
  const totals: Record<string, Kobo> = {};
  for (const c of columns) totals[c.key] = kobo(rows.reduce((s, r) => s + (r.amounts[c.key] ?? 0n), 0n));
  return {
    id: sheet.id,
    meetingDate: sheet.meetingDate,
    status: sheet.status,
    columns,
    rows,
    totals,
    total: kobo(rows.reduce((s, r) => s + r.total, 0n)),
    paidMembers: rows.filter((r) => r.total > 0n).length,
    cashCounted: sheet.cashCounted === null ? null : kobo(sheet.cashCounted),
    transfers: sheet.transfers === null ? null : kobo(sheet.transfers),
    lodgementRef: sheet.lodgementRef,
    differenceNote: sheet.differenceNote,
    submissionId: sheet.submissionId,
    otherLoans: others,
  };
}

function keyOf(l: { kind: CollectionKind; productId: string }) {
  return l.kind === "loan" || l.kind === "interest" ? l.kind : l.productId;
}

export interface CollectionEntry {
  memberId: string;
  /** Amount per column key; missing or zero means nothing paid. */
  amounts: Record<string, Kobo>;
}

/** Replace a draft sheet's amounts with what was actually paid. Every row is checked before anything is saved. */
export async function saveCollectionSheet(tx: Tx, actor: Actor, sheetId: string, entries: CollectionEntry[]): Promise<{ problems: { memberNo: string; message: string }[] }> {
  requireCollections(actor);
  const sheet = await lockSheet(tx, sheetId);
  if (sheet.status !== "draft") throw new CollectionError("This sheet has been submitted and can no longer change.");
  const { columns } = await columnsFor(tx, actor);
  const { byMember: loanOf } = await loansByMember(tx, actor, sheet.meetingDate);
  const ids = [...new Set(entries.map((e) => e.memberId))];
  const people = ids.length ? await tx.select().from(members).where(and(eq(members.societyId, actor.societyId), inArray(members.id, ids))) : [];
  const personById = new Map(people.map((p) => [p.id, p]));
  const problems: { memberNo: string; message: string }[] = [];
  const rows: (typeof collectionLines.$inferInsert)[] = [];

  for (const entry of entries) {
    const person = personById.get(entry.memberId);
    if (!person) {
      problems.push({ memberNo: "?", message: "This member isn't in the register." });
      continue;
    }
    const paid = Object.entries(entry.amounts).filter(([, v]) => v !== 0n);
    if (paid.length === 0) continue;
    if (person.status !== "active") problems.push({ memberNo: person.memberNo, message: `${person.fullName} isn't an active member (${person.status}).` });
    const loan = loanOf.get(person.id);
    for (const [key, amount] of paid) {
      const column = columns.find((c) => c.key === key);
      if (!column) {
        problems.push({ memberNo: person.memberNo, message: "An amount is in a column this society doesn't use." });
        continue;
      }
      if (amount < 0n) {
        problems.push({ memberNo: person.memberNo, message: `${column.label} can't be negative.` });
        continue;
      }
      if (column.kind === "loan" || column.kind === "interest") {
        if (!loan) {
          problems.push({ memberNo: person.memberNo, message: `${person.fullName} has no active loan, so there's nothing to repay.` });
          continue;
        }
        if (column.kind === "loan" && amount > loan.outstanding) {
          problems.push({ memberNo: person.memberNo, message: `Loan #${loan.loan.loanNo} has only ${naira(loan.outstanding)} outstanding. Put the excess in savings.` });
          continue;
        }
        // Flexible loans: interest is paid against what the monthly runs have charged, never ahead of it.
        if (column.kind === "interest" && loan.flexible && amount > loan.interestDue) {
          problems.push({
            memberNo: person.memberNo,
            message: loan.interestDue > 0n ? `Only ${naira(loan.interestDue)} interest is due on loan #${loan.loan.loanNo}. Put the rest towards the loan.` : `No interest is due on loan #${loan.loan.loanNo} yet. Put this towards the loan.`,
          });
          continue;
        }
        rows.push({ societyId: actor.societyId, sheetId, memberId: person.id, kind: column.kind, productId: loan.loan.productId, loanId: loan.loan.id, amount });
      } else {
        rows.push({ societyId: actor.societyId, sheetId, memberId: person.id, kind: column.kind, productId: key, amount });
      }
    }
  }
  if (problems.length) return { problems };
  await tx.delete(collectionLines).where(eq(collectionLines.sheetId, sheetId));
  if (rows.length) await tx.insert(collectionLines).values(rows);
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "collection.recorded",
    entityType: "collection_sheet",
    entityId: sheetId,
    after: { lines: rows.length, total: rows.reduce((s, r) => s + (r.amount as bigint), 0n) },
  });
  return { problems: [] };
}

async function suspenseAccount(tx: Tx, actor: Actor) {
  const [existing] = await tx.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.societyId, actor.societyId), eq(ledgerAccounts.code, SUSPENSE_CODE)));
  if (existing) return existing;
  const [row] = await tx
    .insert(ledgerAccounts)
    .values({ societyId: actor.societyId, code: SUSPENSE_CODE, name: "Unidentified remittances (suspense)", class: "liability" })
    .returning();
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: "account.created", entityType: "ledger_account", entityId: row!.id, after: { code: SUSPENSE_CODE, name: row!.name, reason: "Needed for collection differences" } });
  return row!;
}

/**
 * Prepare the meeting's posting: one journal submission with what was received into the bank,
 * each member's columns credited as designated, and any difference held in suspense.
 */
export async function submitCollectionSheet(
  tx: Tx,
  actor: Actor,
  sheetId: string,
  input: { cashCounted: Kobo; transfers: Kobo; bankAccountId: string; lodgementRef: string; differenceNote: string; idempotencyKey: string },
): Promise<{ submissionId: string }> {
  requireCollections(actor);
  if (!can(actor.roles, "ledger.prepare")) throw new PermissionError("Only an officer who prepares journal entries (the treasurer) can submit the meeting for posting");
  const sheet = await lockSheet(tx, sheetId);
  if (sheet.status !== "draft") throw new CollectionError("This sheet has already been submitted.");
  if (input.cashCounted < 0n || input.transfers < 0n) throw new CollectionError("Amounts received can't be negative.");
  const [bank] = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, input.bankAccountId));
  if (!bank || bank.class !== "asset" || bank.isMemberControl || !bank.isActive) throw new CollectionError("Choose the bank or cash account the money went into.");
  const lines = await tx.select().from(collectionLines).where(eq(collectionLines.sheetId, sheetId));
  const recorded = kobo(lines.reduce((s, l) => s + l.amount, 0n));
  if (recorded === 0n) throw new CollectionError("Nothing is recorded on this sheet yet.");
  const cash = checkCash(recorded, input.cashCounted, input.transfers);
  const note = input.differenceNote.trim();
  if (cash.difference !== 0n && !note) throw new CollectionError("What was received doesn't match the sheet. Explain the difference before submitting.");
  if (cash.received === 0n) throw new CollectionError("Enter the cash counted and the transfers received.");

  const productRows = await tx.select().from(products).where(eq(products.societyId, actor.societyId));
  const productById = new Map(productRows.map((p) => [p.id, p]));
  const people = await tx.select({ id: members.id, memberNo: members.memberNo }).from(members).where(eq(members.societyId, actor.societyId));
  const cardOf = new Map(people.map((p) => [p.id, p.memberNo]));
  const loanIds = [...new Set(lines.flatMap((l) => (l.loanId ? [l.loanId] : [])))];
  const loanRows = loanIds.length ? await tx.select().from(loans).where(inArray(loans.id, loanIds)) : [];
  const interestAccountOf = new Map<string, string>();
  for (const loan of loanRows) interestAccountOf.set(loan.id, await interestCreditAccount(tx, loan));
  const journal: JournalLine[] = [{ accountId: bank.id, side: "debit", amount: cash.received, memo: `Collections ${sheet.meetingDate}${input.lodgementRef.trim() ? ` · ${input.lodgementRef.trim()}` : ""}` }];
  for (const l of [...lines].sort((a, b) => byCard({ memberNo: cardOf.get(a.memberId) ?? "" }, { memberNo: cardOf.get(b.memberId) ?? "" }))) {
    const product = productById.get(l.productId)!;
    if (l.kind === "interest") journal.push({ accountId: interestAccountOf.get(l.loanId!) ?? product.incomeAccountId!, side: "credit", amount: kobo(l.amount), loanId: l.loanId!, memo: "Interest" });
    else journal.push({ accountId: product.accountId, side: "credit", amount: kobo(l.amount), memberId: l.memberId, ...(l.loanId ? { loanId: l.loanId } : {}) });
  }
  if (cash.difference !== 0n) {
    const suspense = await suspenseAccount(tx, actor);
    journal.push({
      accountId: suspense.id,
      side: cash.difference > 0n ? "credit" : "debit",
      amount: kobo(cash.difference > 0n ? cash.difference : -cash.difference),
      memo: `${cash.difference > 0n ? "Collection over" : "Collection short"}: ${note}`,
    });
  }
  const submission = await submitJournalEntry(tx, actor, {
    entryDate: sheet.meetingDate,
    description: `Collections, meeting of ${sheet.meetingDate}`,
    idempotencyKey: input.idempotencyKey,
    lines: journal,
  });
  await tx
    .update(collectionSheets)
    .set({
      status: "submitted",
      submissionId: submission.id,
      cashCounted: input.cashCounted,
      transfers: input.transfers,
      bankAccountId: bank.id,
      lodgementRef: input.lodgementRef.trim() || null,
      differenceNote: note || null,
    })
    .where(eq(collectionSheets.id, sheetId));
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "collection.submitted",
    entityType: "collection_sheet",
    entityId: sheetId,
    after: { submissionId: submission.id, recorded, received: cash.received, difference: cash.difference },
  });
  return { submissionId: submission.id };
}

export interface CollectionSheetSummary {
  id: string;
  meetingDate: string;
  status: SheetRow["status"];
  paidMembers: number;
  total: Kobo;
  received: Kobo | null;
}

export async function listCollectionSheets(tx: Tx, actor: Actor): Promise<CollectionSheetSummary[]> {
  if (!canView(actor)) throw new PermissionError("Your role cannot view collections");
  const rows = await tx.execute<{ id: string; meeting_date: string; status: SheetRow["status"]; paid: number; total: string; received: string | null }>(sql`
    select s.id, s.meeting_date::text, s.status,
      (select count(distinct member_id)::int from collection_lines l where l.sheet_id = s.id) as paid,
      (select coalesce(sum(amount), 0)::text from collection_lines l where l.sheet_id = s.id) as total,
      case when s.cash_counted is null then null else (s.cash_counted + coalesce(s.transfers, 0))::text end as received
    from collection_sheets s where s.society_id = ${actor.societyId}
    order by s.meeting_date desc
  `);
  return rows.map((r) => ({
    id: r.id,
    meetingDate: r.meeting_date,
    status: r.status,
    paidMembers: Number(r.paid),
    total: kobo(BigInt(r.total)),
    received: r.received === null ? null : kobo(BigInt(r.received)),
  }));
}
