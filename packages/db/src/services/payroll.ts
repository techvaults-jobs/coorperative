/**
 * Monthly payroll deductions.
 *
 *   draft → issued → reconciled → submitted → posted
 *
 * A run's schedule comes from members' standing contributions and the loan instalments due
 * by the end of the month (arrears included). Once issued it is frozen and sent to the employer.
 * The employer's remittance file is matched to members by their external ID and allocated by
 * the run's strategy. Submitting creates one journal submission that another officer approves;
 * unidentified money is held in a suspense account until it can be traced.
 */
import {
  allocateRemittance,
  ALLOCATION_STRATEGIES,
  can,
  isPeriod,
  kobo,
  parseRemittanceCsv,
  periodEnd,
  type AllocationStrategy,
  type JournalLine,
  type Kobo,
} from "@techvaults/core";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { ledgerAccounts, loans, memberContributions, members, payrollItems, payrollRemittanceLines, payrollRuns, products } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError, submitJournalEntry, type Actor } from "./ledger.js";
import { loanPosition, splitRepayment } from "./loans.js";

export class PayrollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollError";
  }
}

export const SUSPENSE_CODE = "2900";

function requirePayroll(actor: Actor) {
  if (!can(actor.roles, "payroll.manage")) throw new PermissionError("Your role cannot manage payroll deductions");
}

// ---------------------------------------------------------------------------
// Standing contributions

export interface ContributionView {
  memberId: string;
  productId: string;
  productName: string;
  kind: "savings" | "shares";
  amount: Kobo;
}

export async function listContributions(tx: Tx, actor: Actor, opts: { memberId?: string } = {}): Promise<ContributionView[]> {
  if (!can(actor.roles, "payroll.manage") && !can(actor.roles, "collections.manage") && !can(actor.roles, "members.read")) throw new PermissionError("Your role cannot view contributions");
  const rows = await tx
    .select({ memberId: memberContributions.memberId, productId: products.id, productName: products.name, kind: products.kind, amount: memberContributions.amount })
    .from(memberContributions)
    .innerJoin(products, eq(products.id, memberContributions.productId))
    .where(and(eq(memberContributions.societyId, actor.societyId), opts.memberId ? eq(memberContributions.memberId, opts.memberId) : undefined))
    .orderBy(asc(products.kind), asc(products.code));
  return rows.map((r) => ({ ...r, kind: r.kind as "savings" | "shares", amount: kobo(r.amount) }));
}

/** Set (or with 0, remove) a member's standing contribution to a savings or share product. */
export async function setContribution(tx: Tx, actor: Actor, memberId: string, productId: string, amount: Kobo): Promise<void> {
  // Usual amounts feed both the payroll schedule and the collection sheet (D-027).
  if (!can(actor.roles, "payroll.manage") && !can(actor.roles, "collections.manage")) throw new PermissionError("Your role cannot change contributions");
  const [product] = await tx.select().from(products).where(eq(products.id, productId));
  if (!product || product.kind === "loan" || product.status !== "active") throw new PayrollError("Choose an approved savings or share product.");
  const [before] = await tx.select().from(memberContributions).where(and(eq(memberContributions.memberId, memberId), eq(memberContributions.productId, productId)));
  if (amount < 0n) throw new PayrollError("The amount can't be negative.");
  if (amount === 0n) {
    await tx.delete(memberContributions).where(and(eq(memberContributions.memberId, memberId), eq(memberContributions.productId, productId)));
  } else {
    await tx
      .insert(memberContributions)
      .values({ societyId: actor.societyId, memberId, productId, amount })
      .onConflictDoUpdate({ target: [memberContributions.memberId, memberContributions.productId], set: { amount, updatedAt: new Date() } });
  }
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "contribution.changed",
    entityType: "member",
    entityId: memberId,
    before: { product: product.code, amount: before?.amount ?? null },
    after: { product: product.code, amount: amount === 0n ? null : amount },
  });
}

// ---------------------------------------------------------------------------
// Runs

type RunRow = typeof payrollRuns.$inferSelect;

async function lockRun(tx: Tx, runId: string): Promise<RunRow> {
  const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).for("update");
  if (!run) throw new PayrollError("Payroll run not found.");
  return run;
}

async function buildItems(tx: Tx, actor: Actor, run: RunRow): Promise<number> {
  await tx.delete(payrollItems).where(eq(payrollItems.runId, run.id));
  const contributions = await tx
    .select({ memberId: memberContributions.memberId, productId: memberContributions.productId, kind: products.kind, amount: memberContributions.amount })
    .from(memberContributions)
    .innerJoin(products, eq(products.id, memberContributions.productId))
    .innerJoin(members, eq(members.id, memberContributions.memberId))
    .where(and(eq(memberContributions.societyId, actor.societyId), eq(members.status, "active"), eq(products.status, "active")));
  const rows: (typeof payrollItems.$inferInsert)[] = contributions.map((c) => ({
    societyId: actor.societyId,
    runId: run.id,
    memberId: c.memberId,
    kind: c.kind as "savings" | "shares",
    productId: c.productId,
    scheduled: c.amount,
  }));
  const active = await tx.select().from(loans).where(and(eq(loans.societyId, actor.societyId), eq(loans.status, "active")));
  for (const loan of active) {
    const due = (await loanPosition(tx, loan, periodEnd(run.period))).arrears;
    if (due > 0n) rows.push({ societyId: actor.societyId, runId: run.id, memberId: loan.memberId, kind: "loan", productId: loan.productId, loanId: loan.id, scheduled: due });
  }
  if (rows.length) await tx.insert(payrollItems).values(rows);
  return rows.length;
}

/** Start a month's run and build its schedule. */
export async function createPayrollRun(tx: Tx, actor: Actor, input: { period: string; strategy: string }): Promise<string> {
  requirePayroll(actor);
  if (!isPeriod(input.period)) throw new PayrollError("Choose the month, e.g. 2026-11.");
  if (!(ALLOCATION_STRATEGIES as readonly string[]).includes(input.strategy)) throw new PayrollError("Choose how shortfalls are allocated.");
  const [existing] = await tx.select({ id: payrollRuns.id }).from(payrollRuns).where(and(eq(payrollRuns.societyId, actor.societyId), eq(payrollRuns.period, input.period)));
  if (existing) throw new PayrollError(`There's already a run for ${input.period}.`);
  const [run] = await tx.insert(payrollRuns).values({ societyId: actor.societyId, period: input.period, strategy: input.strategy, createdBy: actor.userId }).returning();
  const items = await buildItems(tx, actor, run!);
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: "payroll.created", entityType: "payroll_run", entityId: run!.id, after: { period: input.period, strategy: input.strategy, items } });
  return run!.id;
}

/** Rebuild a draft's schedule after contributions or loans change. */
export async function rebuildPayrollRun(tx: Tx, actor: Actor, runId: string): Promise<void> {
  requirePayroll(actor);
  const run = await lockRun(tx, runId);
  if (run.status !== "draft") throw new PayrollError("Only a draft schedule can be rebuilt.");
  await buildItems(tx, actor, run);
}

/** Freeze the schedule; it can now be sent to the employer. */
export async function issuePayrollRun(tx: Tx, actor: Actor, runId: string): Promise<void> {
  requirePayroll(actor);
  const run = await lockRun(tx, runId);
  if (run.status !== "draft") throw new PayrollError("This schedule has already been issued.");
  const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from payroll_items where run_id = ${runId}`)) as unknown as [{ n: number }];
  if (Number(n) === 0) throw new PayrollError("The schedule is empty. Set members' monthly contributions first.");
  await tx.update(payrollRuns).set({ status: "issued", issuedAt: new Date() }).where(eq(payrollRuns.id, runId));
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: "payroll.issued", entityType: "payroll_run", entityId: runId });
}

export interface ScheduleRow {
  memberId: string;
  memberNo: string;
  externalId: string | null;
  name: string;
  savings: Kobo;
  shares: Kobo;
  loans: Kobo;
  total: Kobo;
}

/** The schedule, one row per member, as sent to the employer. */
export async function payrollSchedule(tx: Tx, actor: Actor, runId: string): Promise<ScheduleRow[]> {
  if (!can(actor.roles, "payroll.manage") && !can(actor.roles, "ledger.read")) throw new PermissionError("Your role cannot view payroll");
  const items = await tx
    .select({ memberId: payrollItems.memberId, kind: payrollItems.kind, scheduled: payrollItems.scheduled, memberNo: members.memberNo, staffId: members.staffId, name: members.fullName })
    .from(payrollItems)
    .innerJoin(members, eq(members.id, payrollItems.memberId))
    .where(eq(payrollItems.runId, runId));
  const byMember = new Map<string, ScheduleRow>();
  for (const i of items) {
    const row = byMember.get(i.memberId) ?? { memberId: i.memberId, memberNo: i.memberNo, externalId: i.staffId, name: i.name, savings: kobo(0), shares: kobo(0), loans: kobo(0), total: kobo(0) };
    const key = i.kind === "loan" ? "loans" : i.kind;
    row[key] = kobo(row[key] + i.scheduled);
    row.total = kobo(row.total + i.scheduled);
    byMember.set(i.memberId, row);
  }
  return [...byMember.values()].sort((a, b) => a.memberNo.localeCompare(b.memberNo));
}

export interface ImportResult {
  lines: number;
  matched: number;
  unmatched: number;
  errors: { line: number; message: string }[];
}

/**
 * Load the employer's remittance file and allocate it. Re-importing replaces the previous file.
 * A file with unreadable lines is refused as a whole, so nothing is half-loaded.
 */
export async function importRemittance(tx: Tx, actor: Actor, runId: string, csv: string, receivedOn: string): Promise<ImportResult> {
  requirePayroll(actor);
  const run = await lockRun(tx, runId);
  if (run.status !== "issued" && run.status !== "reconciled") throw new PayrollError("Issue the schedule before loading the remittance.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) throw new PayrollError("Enter the date the money was received.");
  const parsed = parseRemittanceCsv(csv);
  if (parsed.errors.length) return { lines: 0, matched: 0, unmatched: 0, errors: parsed.errors };
  if (parsed.rows.length === 0) return { lines: 0, matched: 0, unmatched: 0, errors: [{ line: 1, message: "The file has no deduction lines." }] };
  const people = await tx.select({ id: members.id, staffId: members.staffId }).from(members).where(eq(members.societyId, actor.societyId));
  const byExternal = new Map(people.filter((p) => p.staffId).map((p) => [p.staffId!.trim().toUpperCase(), p.id]));
  await tx.delete(payrollRemittanceLines).where(eq(payrollRemittanceLines.runId, runId));
  const lines = parsed.rows.map((r) => ({
    societyId: actor.societyId,
    runId,
    line: r.line,
    externalId: r.externalId,
    name: r.name || null,
    amount: r.amount as bigint,
    memberId: byExternal.get(r.externalId.toUpperCase()) ?? null,
  }));
  await tx.insert(payrollRemittanceLines).values(lines);
  await allocateRun(tx, run);
  await tx.update(payrollRuns).set({ status: "reconciled", receivedOn }).where(eq(payrollRuns.id, runId));
  const matched = lines.filter((l) => l.memberId).length;
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "payroll.remittance_loaded",
    entityType: "payroll_run",
    entityId: runId,
    after: { lines: lines.length, matched, total: lines.reduce((s, l) => s + l.amount, 0n), receivedOn },
  });
  return { lines: lines.length, matched, unmatched: lines.length - matched, errors: [] };
}

async function allocateRun(tx: Tx, run: RunRow) {
  const items = await tx.select().from(payrollItems).where(eq(payrollItems.runId, run.id));
  const remitted = await tx.select().from(payrollRemittanceLines).where(eq(payrollRemittanceLines.runId, run.id));
  const byMember = new Map<string, bigint>();
  for (const l of remitted) if (l.memberId) byMember.set(l.memberId, (byMember.get(l.memberId) ?? 0n) + l.amount);
  const memberIds = new Set(items.map((i) => i.memberId));
  for (const memberId of memberIds) {
    const mine = items.filter((i) => i.memberId === memberId);
    const result = allocateRemittance(
      mine.map((i) => ({ key: i.id, kind: i.kind, scheduled: kobo(i.scheduled) })),
      kobo(byMember.get(memberId) ?? 0n),
      run.strategy as AllocationStrategy,
    );
    for (const i of mine) await tx.update(payrollItems).set({ allocated: result.allocations.get(i.id) ?? 0n }).where(eq(payrollItems.id, i.id));
  }
}

export type ReconStatus = "ok" | "short" | "over" | "missing" | "unscheduled";

export interface ReconRow {
  memberId: string;
  memberNo: string;
  name: string;
  externalId: string | null;
  scheduled: Kobo;
  remitted: Kobo;
  status: ReconStatus;
  lines: number;
}

export interface Reconciliation {
  rows: ReconRow[];
  unmatched: { line: number; externalId: string; name: string | null; amount: Kobo }[];
  totals: { scheduled: Kobo; remitted: Kobo; matched: Kobo; unmatched: Kobo; shortfall: Kobo; excess: Kobo };
}

/** Scheduled against remitted, member by member, with every exception named. */
export async function payrollReconciliation(tx: Tx, actor: Actor, runId: string): Promise<Reconciliation> {
  const schedule = await payrollSchedule(tx, actor, runId);
  const lines = await tx.select().from(payrollRemittanceLines).where(eq(payrollRemittanceLines.runId, runId)).orderBy(asc(payrollRemittanceLines.line));
  const remitted = new Map<string, { amount: bigint; lines: number }>();
  for (const l of lines) {
    if (!l.memberId) continue;
    const r = remitted.get(l.memberId) ?? { amount: 0n, lines: 0 };
    remitted.set(l.memberId, { amount: r.amount + l.amount, lines: r.lines + 1 });
  }
  const rows: ReconRow[] = schedule.map((s) => {
    const r = remitted.get(s.memberId) ?? { amount: 0n, lines: 0 };
    const status: ReconStatus = r.lines === 0 ? "missing" : r.amount < s.total ? "short" : r.amount > s.total ? "over" : "ok";
    return { memberId: s.memberId, memberNo: s.memberNo, name: s.name, externalId: s.externalId, scheduled: s.total, remitted: kobo(r.amount), status, lines: r.lines };
  });
  const scheduledIds = new Set(schedule.map((s) => s.memberId));
  const extra = [...remitted.entries()].filter(([id]) => !scheduledIds.has(id));
  if (extra.length) {
    const people = await tx.select().from(members).where(inArray(members.id, extra.map(([id]) => id)));
    for (const [id, r] of extra) {
      const m = people.find((p) => p.id === id)!;
      rows.push({ memberId: id, memberNo: m.memberNo, name: m.fullName, externalId: m.staffId, scheduled: kobo(0), remitted: kobo(r.amount), status: "unscheduled", lines: r.lines });
    }
  }
  const unmatched = lines.filter((l) => !l.memberId).map((l) => ({ line: l.line, externalId: l.externalId, name: l.name, amount: kobo(l.amount) }));
  const sum = (xs: bigint[]) => kobo(xs.reduce((a, b) => a + b, 0n));
  return {
    rows,
    unmatched,
    totals: {
      scheduled: sum(rows.map((r) => r.scheduled)),
      remitted: sum(lines.map((l) => l.amount)),
      matched: sum(rows.map((r) => r.remitted)),
      unmatched: sum(unmatched.map((u) => u.amount)),
      shortfall: sum(rows.map((r) => (r.remitted < r.scheduled ? r.scheduled - r.remitted : 0n))),
      excess: sum(rows.map((r) => (r.remitted > r.scheduled ? r.remitted - r.scheduled : 0n))),
    },
  };
}

async function suspenseAccount(tx: Tx, actor: Actor) {
  const [existing] = await tx.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.societyId, actor.societyId), eq(ledgerAccounts.code, SUSPENSE_CODE)));
  if (existing) return existing;
  const [row] = await tx
    .insert(ledgerAccounts)
    .values({ societyId: actor.societyId, code: SUSPENSE_CODE, name: "Unidentified remittances (suspense)", class: "liability" })
    .returning();
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: "account.created", entityType: "ledger_account", entityId: row!.id, after: { code: SUSPENSE_CODE, name: row!.name, reason: "Needed for unidentified payroll remittances" } });
  return row!;
}

/**
 * Prepare the run's posting: one journal submission with the bank receipt, each member's
 * allocations (loan repayments split interest-first), any excess to the member's savings,
 * and unidentified lines to suspense. Another officer approves it.
 */
export async function submitPayrollRun(tx: Tx, actor: Actor, runId: string, input: { bankAccountId: string; idempotencyKey: string }): Promise<{ submissionId: string }> {
  requirePayroll(actor);
  if (!can(actor.roles, "ledger.prepare")) throw new PermissionError("Your role cannot prepare journal entries");
  const run = await lockRun(tx, runId);
  if (run.status !== "reconciled") throw new PayrollError("Load and reconcile the remittance first.");
  const [bank] = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, input.bankAccountId));
  if (!bank || bank.class !== "asset" || bank.isMemberControl || !bank.isActive) throw new PayrollError("Choose the bank account the remittance was paid into.");
  const items = await tx.select().from(payrollItems).where(eq(payrollItems.runId, runId));
  const remitLines = await tx.select().from(payrollRemittanceLines).where(eq(payrollRemittanceLines.runId, runId));
  const productRows = await tx.select().from(products).where(eq(products.societyId, actor.societyId));
  const productById = new Map(productRows.map((p) => [p.id, p]));
  const date = run.receivedOn!;
  const lines: JournalLine[] = [];
  const total = remitLines.reduce((s, l) => s + l.amount, 0n);
  lines.push({ accountId: bank.id, side: "debit", amount: kobo(total), memo: `Payroll remittance ${run.period}` });

  for (const item of items) {
    const amount = kobo(item.allocated ?? 0n);
    if (amount === 0n) continue;
    const product = productById.get(item.productId)!;
    if (item.kind === "loan") {
      const [loan] = await tx.select().from(loans).where(eq(loans.id, item.loanId!));
      const split = await splitRepayment(tx, loan!, amount, date);
      if (split.principal > 0n) lines.push({ accountId: product.accountId, side: "credit", amount: split.principal, memberId: item.memberId, loanId: loan!.id });
      if (split.interest > 0n) lines.push({ accountId: split.interestAccountId, side: "credit", amount: split.interest, loanId: loan!.id, memo: "Interest" });
    } else {
      lines.push({ accountId: product.accountId, side: "credit", amount, memberId: item.memberId });
    }
  }

  // Excess over the schedule, and matched members with nothing scheduled, go to their savings.
  const savingsProduct = productRows.find((p) => p.kind === "savings" && p.status === "active");
  const allocatedByMember = new Map<string, bigint>();
  for (const i of items) allocatedByMember.set(i.memberId, (allocatedByMember.get(i.memberId) ?? 0n) + (i.allocated ?? 0n));
  const remittedByMember = new Map<string, bigint>();
  let unidentified = 0n;
  for (const l of remitLines) {
    if (l.memberId) remittedByMember.set(l.memberId, (remittedByMember.get(l.memberId) ?? 0n) + l.amount);
    else unidentified += l.amount;
  }
  for (const [memberId, remitted] of remittedByMember) {
    const excess = remitted - (allocatedByMember.get(memberId) ?? 0n);
    if (excess <= 0n) continue;
    if (savingsProduct) lines.push({ accountId: savingsProduct.accountId, side: "credit", amount: kobo(excess), memberId, memo: "Excess deduction" });
    else unidentified += excess;
  }
  if (unidentified > 0n) {
    const suspense = await suspenseAccount(tx, actor);
    lines.push({ accountId: suspense.id, side: "credit", amount: kobo(unidentified), memo: "Unidentified remittance" });
  }
  if (total === 0n) throw new PayrollError("Nothing was remitted, so there's nothing to post.");

  const submission = await submitJournalEntry(tx, actor, {
    entryDate: date,
    description: `Payroll deductions ${run.period}`,
    idempotencyKey: input.idempotencyKey,
    lines,
  });
  await tx.update(payrollRuns).set({ status: "submitted", submissionId: submission.id }).where(eq(payrollRuns.id, runId));
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: "payroll.submitted", entityType: "payroll_run", entityId: runId, after: { submissionId: submission.id, total, lines: lines.length } });
  return { submissionId: submission.id };
}

export interface RunView {
  id: string;
  period: string;
  status: RunRow["status"];
  strategy: AllocationStrategy;
  createdAt: Date;
  issuedAt: Date | null;
  receivedOn: string | null;
  submissionId: string | null;
  members: number;
  scheduled: Kobo;
  remitted: Kobo;
}

export async function listPayrollRuns(tx: Tx, actor: Actor): Promise<RunView[]> {
  if (!can(actor.roles, "payroll.manage") && !can(actor.roles, "ledger.read")) throw new PermissionError("Your role cannot view payroll");
  const rows = await tx.execute<{
    id: string;
    period: string;
    status: RunRow["status"];
    strategy: AllocationStrategy;
    created_at: string;
    issued_at: string | null;
    received_on: string | null;
    submission_id: string | null;
    members: number;
    scheduled: string;
    remitted: string;
  }>(sql`
    select r.id, r.period, r.status, r.strategy, r.created_at, r.issued_at, r.received_on::text, r.submission_id,
      (select count(distinct member_id)::int from payroll_items i where i.run_id = r.id) as members,
      (select coalesce(sum(scheduled), 0)::text from payroll_items i where i.run_id = r.id) as scheduled,
      (select coalesce(sum(amount), 0)::text from payroll_remittance_lines l where l.run_id = r.id) as remitted
    from payroll_runs r where r.society_id = ${actor.societyId}
    order by r.period desc
  `);
  return rows.map((r) => ({
    id: r.id,
    period: r.period,
    status: r.status,
    strategy: r.strategy,
    createdAt: new Date(r.created_at),
    issuedAt: r.issued_at ? new Date(r.issued_at) : null,
    receivedOn: r.received_on,
    submissionId: r.submission_id,
    members: Number(r.members),
    scheduled: kobo(BigInt(r.scheduled)),
    remitted: kobo(BigInt(r.remitted)),
  }));
}

export async function getPayrollRun(tx: Tx, actor: Actor, runId: string): Promise<RunView | undefined> {
  return (await listPayrollRuns(tx, actor)).find((r) => r.id === runId);
}
