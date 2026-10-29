/**
 * The monthly interest run for flexible weekly loans (D-028), in place of the workbook's
 * INTREST ACCOUNT sheet and its `outstanding × 0.015` formula.
 *
 *   (preview) → submitted → posted
 *                         ↘ abandoned (posting turned down; the month can be charged again)
 *
 * Each flexible loan is charged its monthly rate on the principal outstanding at the end of the
 * month, rounded half-up to the kobo. The charge posts Dr Interest receivable (per loan),
 * Cr Interest income, once another officer approves it. Interest paid at meetings then clears
 * the receivable; whatever isn't paid stays there as interest arrears.
 */
import { can, isFlexible, isPeriod, kobo, loadLoanPolicy, monthEnd, monthlyInterest, type JournalLine, type Kobo, type StoredLoanPolicy } from "@techvaults/core";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { interestCharges, interestRuns, loans, members, products } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError, submitJournalEntry, type Actor } from "./ledger.js";
import { interestReceivableAccount, loanPosition } from "./loans.js";

export class InterestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterestError";
  }
}

const today = () => new Date().toISOString().slice(0, 10);

function canView(actor: Actor) {
  return can(actor.roles, "ledger.read") || can(actor.roles, "loans.prepare") || can(actor.roles, "loans.approve");
}

type RunRow = typeof interestRuns.$inferSelect;

export interface InterestRegisterRow {
  loanId: string;
  loanNo: number;
  memberId: string;
  memberNo: string;
  memberName: string;
  /** Outstanding principal at the end of the month. */
  balance: Kobo;
  annualRateBps: number;
  charge: Kobo;
  /** Interest charged earlier and still unpaid, as it stands now. */
  unpaid: Kobo;
}

export interface InterestRunView {
  period: string;
  chargeDate: string;
  /** The live run for this month, if it has been charged. */
  run: { id: string; status: RunRow["status"]; submissionId: string; createdAt: Date; createdByName: string } | null;
  rows: InterestRegisterRow[];
  total: Kobo;
  /** Why the month can't be charged yet. Empty when it can. */
  blockers: string[];
}

/** Flexible loans with a balance on the charge date, and what each is charged. */
async function computeCharges(tx: Tx, actor: Actor, chargeDate: string): Promise<InterestRegisterRow[]> {
  const candidates = await tx
    .select({ loan: loans, memberNo: members.memberNo, memberName: members.fullName, accountId: products.accountId })
    .from(loans)
    .innerJoin(members, eq(members.id, loans.memberId))
    .innerJoin(products, eq(products.id, loans.productId))
    .where(and(eq(loans.societyId, actor.societyId), eq(loans.status, "active"), sql`${loans.disbursedOn} <= ${chargeDate}`))
    .orderBy(asc(loans.loanNo));
  const rows: InterestRegisterRow[] = [];
  for (const c of candidates) {
    const policy = loadLoanPolicy(c.loan.policy as unknown as StoredLoanPolicy);
    if (!isFlexible(policy.interestMethod)) continue;
    // Principal outstanding from entries posted up to the charge date.
    const [b] = await tx.execute<{ balance: string }>(sql`
      select coalesce(sum(case l.side when 'debit' then l.amount else -l.amount end), 0)::text as balance
      from journal_lines l join journal_entries e on e.id = l.entry_id
      where l.loan_id = ${c.loan.id} and l.account_id = ${c.accountId} and e.entry_date <= ${chargeDate}
    `);
    const balance = BigInt(b?.balance ?? "0");
    if (balance <= 0n) continue;
    const charge = monthlyInterest(balance, policy.annualRateBps);
    if (charge <= 0n) continue;
    rows.push({
      loanId: c.loan.id,
      loanNo: c.loan.loanNo,
      memberId: c.loan.memberId,
      memberNo: c.memberNo,
      memberName: c.memberName,
      balance: kobo(balance),
      annualRateBps: policy.annualRateBps,
      charge: kobo(charge),
      unpaid: (await loanPosition(tx, c.loan)).interestDue,
    });
  }
  return rows;
}

/** Postings still on their way that would change loan balances on or before the charge date. */
async function blockersFor(tx: Tx, actor: Actor, period: string, chargeDate: string): Promise<string[]> {
  const blockers: string[] = [];
  if (chargeDate > today()) blockers.push(`${period} hasn't ended yet. Its interest is charged on ${chargeDate}, after the month's last meeting.`);
  const [sheets] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from collection_sheets
    where society_id = ${actor.societyId} and status <> 'posted' and meeting_date between ${`${period}-01`} and ${chargeDate}
  `);
  if (Number(sheets?.n ?? 0) > 0) {
    blockers.push(`${sheets!.n} collection sheet${Number(sheets!.n) === 1 ? "" : "s"} from ${period} ${Number(sheets!.n) === 1 ? "isn't" : "aren't"} posted yet. Post them first, so the charge uses the right balances.`);
  }
  const [pending] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from journal_submissions s
    where s.society_id = ${actor.societyId} and s.status = 'pending' and s.entry_date <= ${chargeDate}
      and exists (select 1 from jsonb_array_elements(s.lines) e where e ? 'loanId')
  `);
  if (Number(pending?.n ?? 0) > 0) {
    blockers.push(`${pending!.n} loan entr${Number(pending!.n) === 1 ? "y" : "ies"} dated on or before ${chargeDate} ${Number(pending!.n) === 1 ? "is" : "are"} waiting for approval. Decide ${Number(pending!.n) === 1 ? "it" : "them"} first.`);
  }
  return blockers;
}

async function liveRun(tx: Tx, actor: Actor, period: string) {
  const [run] = await tx
    .select()
    .from(interestRuns)
    .where(and(eq(interestRuns.societyId, actor.societyId), eq(interestRuns.period, period), ne(interestRuns.status, "abandoned")));
  return run ?? null;
}

/**
 * The interest register for a month: the charges already made if it has been run, or what
 * would be charged now if it hasn't, with anything stopping the run.
 */
export async function interestRunForPeriod(tx: Tx, actor: Actor, period: string): Promise<InterestRunView> {
  if (!canView(actor)) throw new PermissionError("Your role cannot view loan interest");
  if (!isPeriod(period)) throw new InterestError("Choose a month.");
  const chargeDate = monthEnd(period);
  const run = await liveRun(tx, actor, period);
  if (!run) {
    const rows = await computeCharges(tx, actor, chargeDate);
    return { period, chargeDate, run: null, rows, total: kobo(rows.reduce((s, r) => s + r.charge, 0n)), blockers: await blockersFor(tx, actor, period, chargeDate) };
  }
  const charged = await tx.execute<{
    loan_id: string;
    loan_no: number;
    member_id: string;
    member_no: string;
    full_name: string;
    balance: string;
    annual_rate_bps: number;
    amount: string;
  }>(sql`
    select c.loan_id, l.loan_no, c.member_id, m.member_no, m.full_name, c.balance::text, c.annual_rate_bps, c.amount::text
    from interest_charges c join loans l on l.id = c.loan_id join members m on m.id = c.member_id
    where c.run_id = ${run.id} order by l.loan_no
  `);
  const [by] = await tx.execute<{ name: string }>(sql`select name from users where id = ${run.createdBy}`);
  const rows: InterestRegisterRow[] = [];
  for (const r of charged) {
    const [loan] = await tx.select().from(loans).where(eq(loans.id, r.loan_id));
    rows.push({
      loanId: r.loan_id,
      loanNo: Number(r.loan_no),
      memberId: r.member_id,
      memberNo: r.member_no,
      memberName: r.full_name,
      balance: kobo(BigInt(r.balance)),
      annualRateBps: Number(r.annual_rate_bps),
      charge: kobo(BigInt(r.amount)),
      unpaid: (await loanPosition(tx, loan!)).interestDue,
    });
  }
  return {
    period,
    chargeDate,
    run: { id: run.id, status: run.status, submissionId: run.submissionId, createdAt: run.createdAt, createdByName: by?.name ?? "" },
    rows,
    total: kobo(run.total),
    blockers: [],
  };
}

/**
 * Charge a month's interest: one journal submission (Dr Interest receivable per loan, Cr each
 * product's income account) that another officer approves. Refused while the month's
 * collections or loan entries are still waiting, so every charge uses posted balances.
 */
export async function submitInterestRun(tx: Tx, actor: Actor, input: { period: string; idempotencyKey: string }): Promise<{ runId: string; submissionId: string; total: Kobo; loans: number }> {
  if (!can(actor.roles, "ledger.prepare")) throw new PermissionError("Only an officer who prepares journal entries (the treasurer) can charge interest");
  if (!isPeriod(input.period)) throw new InterestError("Choose a month.");
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`interest:${actor.societyId}`}, 0))`);
  if (await liveRun(tx, actor, input.period)) throw new InterestError(`Interest for ${input.period} has already been charged.`);
  const chargeDate = monthEnd(input.period);
  const blockers = await blockersFor(tx, actor, input.period, chargeDate);
  if (blockers.length) throw new InterestError(blockers[0]!);
  const rows = await computeCharges(tx, actor, chargeDate);
  if (rows.length === 0) throw new InterestError(`No flexible loan had a balance on ${chargeDate}, so there's nothing to charge.`);

  const receivable = await interestReceivableAccount(tx, actor);
  const loanRows = await tx.select({ id: loans.id, productId: loans.productId }).from(loans).where(eq(loans.societyId, actor.societyId));
  const productOf = new Map(loanRows.map((l) => [l.id, l.productId]));
  const productRows = await tx.select().from(products).where(eq(products.societyId, actor.societyId));
  const incomeOf = new Map(productRows.map((p) => [p.id, p.incomeAccountId!]));
  const income = new Map<string, bigint>();
  const lines: JournalLine[] = [];
  for (const r of rows) {
    lines.push({ accountId: receivable.id, side: "debit", amount: r.charge, loanId: r.loanId, memo: `Interest ${input.period}` });
    const account = incomeOf.get(productOf.get(r.loanId)!)!;
    income.set(account, (income.get(account) ?? 0n) + r.charge);
  }
  for (const [accountId, amount] of income) lines.push({ accountId, side: "credit", amount: kobo(amount), memo: `Interest charged on loans, ${input.period}` });
  const total = kobo(rows.reduce((s, r) => s + r.charge, 0n));

  const submission = await submitJournalEntry(tx, actor, {
    entryDate: chargeDate,
    description: `Loan interest for ${input.period}`,
    idempotencyKey: input.idempotencyKey,
    lines,
  });
  const [run] = await tx
    .insert(interestRuns)
    .values({ societyId: actor.societyId, period: input.period, chargeDate, total, createdBy: actor.userId, submissionId: submission.id })
    .returning({ id: interestRuns.id });
  await tx.insert(interestCharges).values(
    rows.map((r) => ({ societyId: actor.societyId, runId: run!.id, loanId: r.loanId, memberId: r.memberId, balance: r.balance, annualRateBps: r.annualRateBps, amount: r.charge })),
  );
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "interest.charged",
    entityType: "interest_run",
    entityId: run!.id,
    after: { period: input.period, chargeDate, loans: rows.length, total, submissionId: submission.id },
  });
  return { runId: run!.id, submissionId: submission.id, total, loans: rows.length };
}

export interface InterestMonth {
  period: string;
  chargeDate: string;
  status: RunRow["status"] | "due" | "open";
  total: Kobo | null;
  loans: number;
}

/**
 * Every month from the first flexible loan's disbursement to this one, with whether its
 * interest has been charged. "due" means the month has ended and isn't charged yet.
 */
export async function interestMonths(tx: Tx, actor: Actor): Promise<{ hasFlexibleLoans: boolean; months: InterestMonth[] }> {
  if (!canView(actor)) throw new PermissionError("Your role cannot view loan interest");
  const flexible = (await tx.select({ policy: loans.policy, disbursedOn: loans.disbursedOn }).from(loans).where(eq(loans.societyId, actor.societyId))).filter(
    (l) => l.disbursedOn && isFlexible(loadLoanPolicy(l.policy as unknown as StoredLoanPolicy).interestMethod),
  );
  const runs = await tx.execute<{ period: string; status: RunRow["status"]; total: string; loans: number }>(sql`
    select r.period, r.status, r.total::text, (select count(*)::int from interest_charges c where c.run_id = r.id) as loans
    from interest_runs r where r.society_id = ${actor.societyId} and r.status <> 'abandoned'
  `);
  const runOf = new Map(runs.map((r) => [r.period, r]));
  const first = [...flexible.map((l) => l.disbursedOn!.slice(0, 7)), ...runs.map((r) => r.period)].sort()[0];
  if (!first) return { hasFlexibleLoans: false, months: [] };
  const now = today();
  const months: InterestMonth[] = [];
  for (let p = first; p <= now.slice(0, 7); p = nextPeriod(p)) {
    const run = runOf.get(p);
    const chargeDate = monthEnd(p);
    months.push({
      period: p,
      chargeDate,
      status: run ? run.status : chargeDate <= now ? "due" : "open",
      total: run ? kobo(BigInt(run.total)) : null,
      loans: run ? Number(run.loans) : 0,
    });
  }
  return { hasFlexibleLoans: flexible.length > 0, months: months.reverse() };
}

function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export interface LoanInterestCharge {
  period: string;
  chargeDate: string;
  status: RunRow["status"];
  balance: Kobo;
  amount: Kobo;
}

/** The monthly charges on one loan, newest first, including any waiting for approval. */
export async function loanInterestCharges(tx: Tx, actor: Actor, loanId: string): Promise<LoanInterestCharge[]> {
  const rows = await tx.execute<{ period: string; charge_date: string; status: RunRow["status"]; balance: string; amount: string }>(sql`
    select r.period, r.charge_date::text, r.status, c.balance::text, c.amount::text
    from interest_charges c join interest_runs r on r.id = c.run_id
    where c.loan_id = ${loanId} and r.society_id = ${actor.societyId} and r.status <> 'abandoned'
    order by r.period desc
  `);
  return rows.map((r) => ({ period: r.period, chargeDate: r.charge_date, status: r.status, balance: kobo(BigInt(r.balance)), amount: kobo(BigInt(r.amount)) }));
}
