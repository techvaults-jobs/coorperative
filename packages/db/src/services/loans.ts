/**
 * The loan lifecycle: application (with an eligibility check against the product's approved
 * policy), committee decision, disbursement and repayments through the journal, and the loan's
 * position and arrears derived from its sub-ledger.
 *
 *   applied → approved → disbursing → active → closed
 *          ↘ rejected / withdrawn      (disbursement rejected → approved again)
 *
 * Maker-checker applies twice: a different officer decides the application, and every
 * disbursement and repayment is a journal submission another officer approves.
 */
import {
  buildSchedule,
  can,
  checkEligibility,
  expectedWeeklyRepayment,
  isFlexible,
  kobo,
  loadLoanPolicy,
  monthlyInterest,
  processingFee,
  weeklyProgress,
  type EligibilityCheck,
  type Kobo,
  type LoanPolicy,
  type Schedule,
  type StoredLoanPolicy,
  type WeeklyProgress,
} from "@techvaults/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { ledgerAccounts, loanGuarantors, loans, members, products } from "../schema.js";
import { recordAudit } from "./audit.js";
import { isSelf, PermissionError, submitJournalEntry, type Actor } from "./ledger.js";

export class LoanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanError";
  }
}

type LoanRow = typeof loans.$inferSelect;

/** Where monthly interest on flexible weekly loans (D-028) waits until the member pays it. */
export const INTEREST_RECEIVABLE_CODE = "1400";

export async function findInterestReceivable(tx: Tx, societyId: string) {
  const [a] = await tx.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.societyId, societyId), eq(ledgerAccounts.code, INTEREST_RECEIVABLE_CODE)));
  return a ?? null;
}

/** The interest receivable account, created the first time a society needs it. */
export async function interestReceivableAccount(tx: Tx, actor: Actor) {
  const existing = await findInterestReceivable(tx, actor.societyId);
  if (existing) return existing;
  const [row] = await tx
    .insert(ledgerAccounts)
    .values({ societyId: actor.societyId, code: INTEREST_RECEIVABLE_CODE, name: "Interest receivable on loans", class: "asset" })
    .returning();
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "account.created",
    entityType: "ledger_account",
    entityId: row!.id,
    after: { code: INTEREST_RECEIVABLE_CODE, name: row!.name, reason: "Needed for monthly interest on flexible loans" },
  });
  return row!;
}

export const loanIsFlexible = (loan: Pick<LoanRow, "policy">) => isFlexible(loadLoanPolicy(loan.policy as unknown as StoredLoanPolicy).interestMethod);

export type LoanStatus = LoanRow["status"];

async function activeLoanProduct(tx: Tx, productId: string) {
  const [p] = await tx.select().from(products).where(eq(products.id, productId));
  if (!p || p.kind !== "loan") throw new LoanError("Choose a loan product.");
  if (p.status !== "active" || !p.policy) throw new LoanError("That loan product isn't approved for use yet.");
  return { product: p, policy: loadLoanPolicy(p.policy as unknown as StoredLoanPolicy) };
}

/** A member's savings: credits less debits on member liability accounts. */
async function memberSavings(tx: Tx, memberId: string): Promise<Kobo> {
  const [row] = await tx.execute<{ s: string }>(sql`
    select coalesce(sum(case l.side when 'credit' then l.amount else -l.amount end), 0)::text as s
    from journal_lines l join ledger_accounts a on a.id = l.account_id
    where l.member_id = ${memberId} and a.class = 'liability' and a.is_member_control
  `);
  return kobo(BigInt(row?.s ?? "0"));
}

async function runningLoans(tx: Tx, memberId: string, productId: string, excludeLoanId?: string): Promise<number> {
  const rows = await tx
    .select({ id: loans.id })
    .from(loans)
    .where(and(eq(loans.memberId, memberId), eq(loans.productId, productId), inArray(loans.status, ["applied", "approved", "disbursing", "active"])));
  return rows.filter((r) => r.id !== excludeLoanId).length;
}

export interface EligibilityResult {
  eligible: boolean;
  checks: EligibilityCheck[];
  schedule: Schedule | null;
  /** Flexible weekly loans: the expected weekly repayment and the first month's interest. */
  weekly: { repayment: Kobo; firstMonthInterest: Kobo } | null;
  fee: Kobo;
  savings: Kobo;
}

const today = () => new Date().toISOString().slice(0, 10);
const endOfNextMonth = (asOf: string) => {
  const [y, m] = asOf.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
};

/** Check a prospective loan against the product's approved policy, with a schedule preview. */
export async function loanEligibility(
  tx: Tx,
  actor: Actor,
  input: { memberId: string; productId: string; amount: Kobo; termMonths: number; guarantors: number; asOf?: string },
): Promise<EligibilityResult> {
  const selfApply = isSelf(actor, input.memberId) && can(actor.roles, "self.apply");
  if (!can(actor.roles, "loans.prepare") && !can(actor.roles, "loans.approve") && !selfApply) throw new PermissionError("Your role cannot work on loans");
  const { product, policy } = await activeLoanProduct(tx, input.productId);
  const [member] = await tx.select().from(members).where(eq(members.id, input.memberId));
  if (!member) throw new LoanError("Choose a member.");
  const asOf = input.asOf ?? today();
  const savings = await memberSavings(tx, member.id);
  const result = checkEligibility(
    policy,
    { status: member.status, joinedOn: member.joinedOn, savings, activeLoansOfProduct: await runningLoans(tx, member.id, product.id) },
    { amount: input.amount, termMonths: input.termMonths, guarantors: input.guarantors },
    asOf,
  );
  const schedulable = input.amount > 0n && input.termMonths >= 1 && input.termMonths <= 120;
  const flexible = isFlexible(policy.interestMethod);
  return {
    ...result,
    schedule: schedulable && !flexible ? buildSchedule(input.amount, input.termMonths, policy.interestMethod, policy.annualRateBps, endOfNextMonth(asOf)) : null,
    weekly:
      schedulable && flexible
        ? { repayment: expectedWeeklyRepayment(input.amount, input.termMonths), firstMonthInterest: kobo(monthlyInterest(input.amount, policy.annualRateBps)) }
        : null,
    fee: input.amount > 0n ? processingFee(input.amount, policy) : kobo(0),
    savings,
  };
}

/** Record a member's application. It must pass every rule of the product's approved policy. */
export async function applyForLoan(
  tx: Tx,
  actor: Actor,
  input: { memberId: string; productId: string; amount: Kobo; termMonths: number; purpose: string; guarantorIds: string[] },
): Promise<{ id: string; loanNo: number }> {
  const selfApply = isSelf(actor, input.memberId) && can(actor.roles, "self.apply");
  if (!can(actor.roles, "loans.prepare") && !selfApply) throw new PermissionError("Your role cannot record loan applications");
  if (input.purpose.trim().length < 4) throw new LoanError("Say what the loan is for.");
  const guarantorIds = [...new Set(input.guarantorIds)];
  if (guarantorIds.includes(input.memberId)) throw new LoanError("A member can't guarantee their own loan.");
  if (guarantorIds.length) {
    const found = await tx.select().from(members).where(inArray(members.id, guarantorIds));
    if (found.length !== guarantorIds.length || found.some((g) => g.status !== "active")) throw new LoanError("Every guarantor must be an active member.");
  }
  const check = await loanEligibility(tx, actor, { ...input, guarantors: guarantorIds.length });
  if (!check.eligible) {
    throw new LoanError(`This application doesn't meet the product's rules: ${check.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join("; ")}.`);
  }
  const { product } = await activeLoanProduct(tx, input.productId);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`loans:${actor.societyId}`}, 0))`);
  const [{ next }] = (await tx.execute<{ next: number }>(
    sql`select coalesce(max(loan_no), 0) + 1 as next from loans where society_id = ${actor.societyId}`,
  )) as unknown as [{ next: number }];
  const [row] = await tx
    .insert(loans)
    .values({
      societyId: actor.societyId,
      loanNo: Number(next),
      memberId: input.memberId,
      productId: product.id,
      amount: input.amount,
      termMonths: input.termMonths,
      purpose: input.purpose.trim(),
      policy: product.policy!,
      policyVersion: product.version,
      appliedBy: actor.userId,
    })
    .returning({ id: loans.id, loanNo: loans.loanNo });
  if (guarantorIds.length) {
    await tx.insert(loanGuarantors).values(guarantorIds.map((memberId) => ({ societyId: actor.societyId, loanId: row!.id, memberId })));
  }
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "loan.applied",
    entityType: "loan",
    entityId: row!.id,
    after: { loanNo: row!.loanNo, memberId: input.memberId, product: product.code, amount: input.amount, termMonths: input.termMonths, guarantorIds },
  });
  return row!;
}

async function lockLoan(tx: Tx, loanId: string): Promise<LoanRow> {
  const [loan] = await tx.select().from(loans).where(eq(loans.id, loanId)).for("update");
  if (!loan) throw new LoanError("Loan not found.");
  return loan;
}

/** The loan committee's decision. The officer who recorded the application can't decide it. */
export async function decideLoan(tx: Tx, actor: Actor, loanId: string, decision: "approve" | "reject", reason: string): Promise<void> {
  if (!can(actor.roles, "loans.approve")) throw new PermissionError("Your role cannot approve loans");
  const loan = await lockLoan(tx, loanId);
  if (loan.status !== "applied") throw new LoanError(`This loan is already ${loan.status}.`);
  if (loan.appliedBy === actor.userId) throw new PermissionError("The person who recorded this application cannot also decide it");
  if (decision === "reject" && reason.trim().length < 5) throw new LoanError("Give the member a reason for the rejection.");
  const status = decision === "approve" ? "approved" : "rejected";
  await tx.update(loans).set({ status, decidedBy: actor.userId, decidedAt: new Date(), decisionReason: reason.trim() || null }).where(eq(loans.id, loanId));
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: `loan.${status}`,
    entityType: "loan",
    entityId: loanId,
    ...(reason.trim() ? { reason: reason.trim() } : {}),
  });
}

export async function withdrawLoan(tx: Tx, actor: Actor, loanId: string, reason: string): Promise<void> {
  if (!can(actor.roles, "loans.prepare")) throw new PermissionError("Your role cannot withdraw loan applications");
  const loan = await lockLoan(tx, loanId);
  if (!["applied", "approved"].includes(loan.status)) throw new LoanError(`A ${loan.status} loan can't be withdrawn.`);
  await tx.update(loans).set({ status: "withdrawn", decidedBy: actor.userId, decidedAt: new Date(), decisionReason: reason.trim() || null }).where(eq(loans.id, loanId));
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: "loan.withdrawn", entityType: "loan", entityId: loanId, ...(reason.trim() ? { reason } : {}) });
}

async function memberNo(tx: Tx, memberId: string) {
  const [m] = await tx.select({ memberNo: members.memberNo }).from(members).where(eq(members.id, memberId));
  return m?.memberNo ?? "";
}

async function bankAccount(tx: Tx, accountId: string) {
  const [a] = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, accountId));
  if (!a || a.class !== "asset" || a.isMemberControl || !a.isActive) throw new LoanError("Choose the bank or cash account the money moves through.");
  return a;
}

/**
 * Prepare the disbursement of an approved loan: a journal submission paying the member
 * (less any processing fee) that another officer approves. The loan becomes active when posted.
 */
export async function disburseLoan(
  tx: Tx,
  actor: Actor,
  loanId: string,
  input: { disbursedOn: string; firstDueDate: string; bankAccountId: string; idempotencyKey: string },
): Promise<{ submissionId: string }> {
  if (!can(actor.roles, "ledger.prepare")) throw new PermissionError("Your role cannot prepare disbursements");
  const loan = await lockLoan(tx, loanId);
  if (loan.status !== "approved") throw new LoanError(loan.status === "disbursing" ? "This loan's disbursement is already waiting for approval." : `A ${loan.status} loan can't be disbursed.`);
  if (input.firstDueDate <= input.disbursedOn) throw new LoanError("The first repayment must fall after the disbursement date.");
  const policy = loadLoanPolicy(loan.policy as unknown as StoredLoanPolicy);
  const [product] = await tx.select().from(products).where(eq(products.id, loan.productId));
  const bank = await bankAccount(tx, input.bankAccountId);
  const amount = kobo(loan.amount);
  const fee = processingFee(amount, policy);
  const no = await memberNo(tx, loan.memberId);
  const submission = await submitJournalEntry(tx, actor, {
    entryDate: input.disbursedOn,
    description: `Loan #${loan.loanNo} disbursement – ${no}`,
    idempotencyKey: input.idempotencyKey,
    lines: [
      { accountId: product!.accountId, side: "debit", amount, memberId: loan.memberId, loanId: loan.id },
      { accountId: bank.id, side: "credit", amount: kobo(amount - fee) },
      ...(fee > 0n ? [{ accountId: product!.incomeAccountId!, side: "credit" as const, amount: fee, loanId: loan.id, memo: "Processing fee" }] : []),
    ],
  });
  await tx
    .update(loans)
    .set({ status: "disbursing", disbursementSubmissionId: submission.id, disbursedOn: input.disbursedOn, firstDueDate: input.firstDueDate })
    .where(eq(loans.id, loanId));
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "loan.disbursement_prepared",
    entityType: "loan",
    entityId: loanId,
    after: { submissionId: submission.id, disbursedOn: input.disbursedOn, firstDueDate: input.firstDueDate, fee },
  });
  return { submissionId: submission.id };
}

export interface LoanPosition {
  principalOutstanding: Kobo;
  principalRepaid: Kobo;
  interestPaid: Kobo;
  /** Flexible loans: interest charged by the monthly runs. Scheduled loans: interest due under the schedule to date. */
  interestCharged: Kobo;
  /** Interest charged or due to date and not yet paid (interest arrears). */
  interestDue: Kobo;
  /** Principal plus interest due by `asOf`, less what's been paid. */
  arrears: Kobo;
  /** Days since the earliest repayment that isn't fully covered, 0 if up to date. */
  daysPastDue: number;
  /** Next repayment not yet fully covered, if any. */
  nextDue: { number: number; dueDate: string; amount: Kobo } | null;
  schedule: Schedule | null;
  /** Flexible weekly loans only: progress against the expected weekly repayments. */
  weekly: WeeklyProgress | null;
}

/**
 * A loan's position from its sub-ledger. Scheduled loans: payments cover instalments in order.
 * Flexible loans: interest charged and paid sit on interest receivable, and principal is
 * tracked against the expected weekly repayment.
 */
export async function loanPosition(tx: Tx, loan: LoanRow, asOf = today()): Promise<LoanPosition> {
  const [product] = await tx.select().from(products).where(eq(products.id, loan.productId));
  const policy = loadLoanPolicy(loan.policy as unknown as StoredLoanPolicy);
  const flexible = isFlexible(policy.interestMethod);
  const receivable = flexible ? await findInterestReceivable(tx, loan.societyId) : null;
  const [row] = await tx.execute<{ disbursed: string; repaid: string; interest: string; charged: string; received: string }>(sql`
    select
      coalesce(sum(l.amount) filter (where l.account_id = ${product!.accountId} and l.side = 'debit'), 0)::text as disbursed,
      coalesce(sum(l.amount) filter (where l.account_id = ${product!.accountId} and l.side = 'credit'), 0)::text as repaid,
      coalesce(sum(case when l.side = 'credit' then l.amount else -l.amount end)
        filter (where l.account_id = ${product!.incomeAccountId} and coalesce(l.memo, '') <> 'Processing fee'), 0)::text as interest,
      coalesce(sum(l.amount) filter (where l.account_id = ${receivable?.id ?? null} and l.side = 'debit'), 0)::text as charged,
      coalesce(sum(l.amount) filter (where l.account_id = ${receivable?.id ?? null} and l.side = 'credit'), 0)::text as received
    from journal_lines l where l.loan_id = ${loan.id}
  `);
  const disbursed = BigInt(row!.disbursed);
  const repaid = BigInt(row!.repaid);
  const outstanding = kobo(disbursed - repaid);

  if (flexible) {
    const charged = BigInt(row!.charged);
    const interestPaid = BigInt(row!.received);
    const interestDue = charged > interestPaid ? charged - interestPaid : 0n;
    const weekly = loan.firstDueDate && disbursed > 0n ? weeklyProgress(kobo(disbursed), loan.termMonths, loan.firstDueDate, repaid, asOf) : null;
    return {
      principalOutstanding: outstanding,
      principalRepaid: kobo(repaid),
      interestPaid: kobo(interestPaid),
      interestCharged: kobo(charged),
      interestDue: kobo(interestDue),
      arrears: kobo((weekly?.behind ?? 0n) + interestDue),
      daysPastDue: weekly?.daysPastDue ?? 0,
      nextDue: weekly?.nextDue ?? null,
      schedule: null,
      weekly,
    };
  }

  const interestPaid = BigInt(row!.interest);
  const schedule = loan.firstDueDate ? buildSchedule(kobo(loan.amount), loan.termMonths, policy.interestMethod, policy.annualRateBps, loan.firstDueDate) : null;
  let arrears = 0n;
  let daysPastDue = 0;
  let nextDue: LoanPosition["nextDue"] = null;
  if (schedule && disbursed > 0n) {
    let paid = repaid + interestPaid;
    for (const inst of schedule.instalments) {
      const cover = paid >= inst.payment ? inst.payment : paid;
      paid -= cover;
      const shortfall = inst.payment - cover;
      if (shortfall <= 0n) continue;
      if (inst.dueDate <= asOf) {
        arrears += shortfall;
        if (daysPastDue === 0) daysPastDue = Math.max(1, Math.round((Date.parse(asOf) - Date.parse(inst.dueDate)) / 86_400_000));
      } else if (!nextDue) {
        nextDue = { number: inst.number, dueDate: inst.dueDate, amount: kobo(shortfall) };
      }
    }
  }
  const scheduledInterest = (schedule?.instalments ?? []).filter((i) => i.dueDate <= asOf).reduce((s, i) => s + i.interest, 0n);
  return {
    principalOutstanding: outstanding,
    principalRepaid: kobo(repaid),
    interestPaid: kobo(interestPaid),
    interestCharged: kobo(scheduledInterest),
    interestDue: kobo(scheduledInterest > interestPaid ? scheduledInterest - interestPaid : 0n),
    arrears: kobo(arrears),
    daysPastDue,
    nextDue,
    schedule,
    weekly: null,
  };
}

/**
 * Split a payment on a loan, "interest first": interest due to `paidOn` and not yet paid is
 * covered first, the rest reduces principal. Refuses more than is owed. Interest is credited
 * to income on scheduled loans and to interest receivable on flexible ones (where the monthly
 * run already recognised the income).
 */
export async function splitRepayment(tx: Tx, loan: LoanRow, amount: Kobo, paidOn: string): Promise<{ interest: Kobo; principal: Kobo; interestAccountId: string }> {
  const position = await loanPosition(tx, loan, paidOn);
  const interestDue = position.interestDue;
  const interest = kobo(amount < interestDue ? amount : interestDue);
  const principal = kobo(amount - interest);
  if (principal > position.principalOutstanding) {
    throw new LoanError(
      `Loan #${loan.loanNo}: that's more than the outstanding principal and interest due (${(Number(position.principalOutstanding + interest) / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" })}).`,
    );
  }
  return { interest, principal, interestAccountId: await interestCreditAccount(tx, loan) };
}

/** The account a loan's interest payments are credited to. */
export async function interestCreditAccount(tx: Tx, loan: LoanRow): Promise<string> {
  if (loanIsFlexible(loan)) {
    const receivable = await findInterestReceivable(tx, loan.societyId);
    if (receivable) return receivable.id;
  }
  const [product] = await tx.select().from(products).where(eq(products.id, loan.productId));
  return product!.incomeAccountId!;
}

/**
 * Prepare a repayment. Interest due under the schedule to date is covered first, then
 * principal (a named allocation strategy, "interest first"). Another officer approves it.
 */
export async function recordRepayment(
  tx: Tx,
  actor: Actor,
  loanId: string,
  input: { amount: Kobo; paidOn: string; bankAccountId: string; idempotencyKey: string },
): Promise<{ submissionId: string; interest: Kobo; principal: Kobo }> {
  if (!can(actor.roles, "ledger.prepare")) throw new PermissionError("Your role cannot prepare repayments");
  if (input.amount <= 0n) throw new LoanError("Enter the amount paid.");
  const loan = await lockLoan(tx, loanId);
  if (loan.status !== "active") throw new LoanError(`Repayments can only be recorded on an active loan (this one is ${loan.status}).`);
  const { interest, principal, interestAccountId } = await splitRepayment(tx, loan, input.amount, input.paidOn);
  const [product] = await tx.select().from(products).where(eq(products.id, loan.productId));
  const bank = await bankAccount(tx, input.bankAccountId);
  const no = await memberNo(tx, loan.memberId);
  const submission = await submitJournalEntry(tx, actor, {
    entryDate: input.paidOn,
    description: `Loan #${loan.loanNo} repayment – ${no}`,
    idempotencyKey: input.idempotencyKey,
    lines: [
      { accountId: bank.id, side: "debit", amount: input.amount },
      ...(principal > 0n ? [{ accountId: product!.accountId, side: "credit" as const, amount: principal, memberId: loan.memberId, loanId: loan.id }] : []),
      ...(interest > 0n ? [{ accountId: interestAccountId, side: "credit" as const, amount: interest, loanId: loan.id, memo: "Interest" }] : []),
    ],
  });
  return { submissionId: submission.id, interest, principal };
}

export interface LoanView {
  id: string;
  loanNo: number;
  status: LoanStatus;
  memberId: string;
  memberNo: string;
  memberName: string;
  productId: string;
  productName: string;
  amount: Kobo;
  termMonths: number;
  purpose: string;
  appliedAt: Date;
  appliedByName: string;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  disbursedOn: string | null;
  firstDueDate: string | null;
  policy: LoanPolicy;
  policyVersion: number;
}

export async function listLoans(tx: Tx, actor: Actor, opts: { status?: LoanStatus[]; memberId?: string } = {}): Promise<LoanView[]> {
  if (!can(actor.roles, "loans.prepare") && !can(actor.roles, "loans.approve") && !can(actor.roles, "ledger.read")) {
    // A member sees only their own loans.
    if (!actor.memberId || !isSelf(actor, actor.memberId)) throw new PermissionError("Your role cannot view loans");
    opts = { ...opts, memberId: actor.memberId };
  }
  const rows = await tx.execute<{
    id: string;
    loan_no: number;
    status: LoanStatus;
    member_id: string;
    member_no: string;
    full_name: string;
    product_id: string;
    product_name: string;
    amount: string;
    term_months: number;
    purpose: string;
    applied_at: string;
    applied_by_name: string;
    decided_by_name: string | null;
    decided_at: string | null;
    decision_reason: string | null;
    disbursed_on: string | null;
    first_due_date: string | null;
    policy: StoredLoanPolicy;
    policy_version: number;
  }>(sql`
    select l.id, l.loan_no, l.status, l.member_id, m.member_no, m.full_name, l.product_id, p.name as product_name,
           l.amount::text, l.term_months, l.purpose, l.applied_at, a.name as applied_by_name, d.name as decided_by_name,
           l.decided_at, l.decision_reason, l.disbursed_on::text, l.first_due_date::text, l.policy, l.policy_version
    from loans l
    join members m on m.id = l.member_id
    join products p on p.id = l.product_id
    join users a on a.id = l.applied_by
    left join users d on d.id = l.decided_by
    where l.society_id = ${actor.societyId}
      and ${opts.status?.length ? sql`l.status in ${opts.status}` : sql`true`}
      and ${opts.memberId ? sql`l.member_id = ${opts.memberId}` : sql`true`}
    order by l.loan_no desc
  `);
  return rows.map((r) => ({
    id: r.id,
    loanNo: Number(r.loan_no),
    status: r.status,
    memberId: r.member_id,
    memberNo: r.member_no,
    memberName: r.full_name,
    productId: r.product_id,
    productName: r.product_name,
    amount: kobo(BigInt(r.amount)),
    termMonths: Number(r.term_months),
    purpose: r.purpose,
    appliedAt: new Date(r.applied_at),
    appliedByName: r.applied_by_name,
    decidedByName: r.decided_by_name,
    decidedAt: r.decided_at ? new Date(r.decided_at) : null,
    decisionReason: r.decision_reason,
    disbursedOn: r.disbursed_on,
    firstDueDate: r.first_due_date,
    policy: loadLoanPolicy(r.policy),
    policyVersion: Number(r.policy_version),
  }));
}

export async function getLoan(tx: Tx, actor: Actor, loanId: string) {
  const [view] = (await listLoans(tx, actor)).filter((l) => l.id === loanId);
  if (!view) return null;
  const [row] = await tx.select().from(loans).where(eq(loans.id, loanId));
  const guarantors = await tx
    .select({ id: members.id, memberNo: members.memberNo, fullName: members.fullName })
    .from(loanGuarantors)
    .innerJoin(members, eq(members.id, loanGuarantors.memberId))
    .where(eq(loanGuarantors.loanId, loanId));
  return { ...view, appliedBy: row!.appliedBy, guarantors, position: await loanPosition(tx, row!) };
}

export interface PortfolioSummary {
  activeCount: number;
  outstanding: Kobo;
  inArrearsCount: number;
  arrears: Kobo;
  /** Outstanding principal on loans more than 30 days past due, as a share of all outstanding. */
  par30: number;
  pendingApplications: number;
  awaitingDisbursement: number;
}

export async function portfolioSummary(tx: Tx, actor: Actor, asOf = today()): Promise<PortfolioSummary & { positions: Map<string, LoanPosition> }> {
  const all = await listLoans(tx, actor);
  const active = all.filter((l) => l.status === "active");
  const rows = active.length ? await tx.select().from(loans).where(inArray(loans.id, active.map((l) => l.id))) : [];
  const positions = new Map<string, LoanPosition>();
  for (const r of rows) positions.set(r.id, await loanPosition(tx, r, asOf));
  let outstanding = 0n;
  let arrears = 0n;
  let par30 = 0n;
  let inArrears = 0;
  for (const p of positions.values()) {
    outstanding += p.principalOutstanding;
    arrears += p.arrears;
    if (p.arrears > 0n) inArrears++;
    if (p.daysPastDue > 30) par30 += p.principalOutstanding;
  }
  return {
    activeCount: active.length,
    outstanding: kobo(outstanding),
    inArrearsCount: inArrears,
    arrears: kobo(arrears),
    par30: outstanding > 0n ? Number((par30 * 10_000n) / outstanding) / 100 : 0,
    pendingApplications: all.filter((l) => l.status === "applied").length,
    awaitingDisbursement: all.filter((l) => l.status === "approved" || l.status === "disbursing").length,
    positions,
  };
}

export const AGING_BUCKETS = [
  { key: "current", label: "Current", min: 0, max: 0 },
  { key: "d1_30", label: "1–30 days", min: 1, max: 30 },
  { key: "d31_60", label: "31–60 days", min: 31, max: 60 },
  { key: "d61_90", label: "61–90 days", min: 61, max: 90 },
  { key: "d90", label: "Over 90 days", min: 91, max: Infinity },
] as const;

export interface AgingReport {
  asOf: string;
  buckets: { key: string; label: string; count: number; outstanding: Kobo; arrears: Kobo }[];
  loans: (LoanView & { position: LoanPosition; bucket: string })[];
  total: Kobo;
}

/** Active loans by how late their oldest unpaid instalment is, as at a date. */
export async function loanAging(tx: Tx, actor: Actor, asOf = today()): Promise<AgingReport> {
  const summary = await portfolioSummary(tx, actor, asOf);
  const active = (await listLoans(tx, actor, { status: ["active"] })).map((l) => {
    const position = summary.positions.get(l.id)!;
    const bucket = AGING_BUCKETS.find((b) => position.daysPastDue >= b.min && position.daysPastDue <= b.max)!.key;
    return { ...l, position, bucket };
  });
  return {
    asOf,
    buckets: AGING_BUCKETS.map((b) => {
      const mine = active.filter((l) => l.bucket === b.key);
      return {
        key: b.key,
        label: b.label,
        count: mine.length,
        outstanding: kobo(mine.reduce((s, l) => s + l.position.principalOutstanding, 0n)),
        arrears: kobo(mine.reduce((s, l) => s + l.position.arrears, 0n)),
      };
    }),
    loans: active.sort((a, b) => b.position.daysPastDue - a.position.daysPastDue),
    total: summary.outstanding,
  };
}

/**
 * Resolve guarantors a member names by member number, for the member portal. Returns only the
 * name of each active member found, so a member can confirm the right person without seeing
 * the register.
 */
export async function resolveGuarantors(tx: Tx, actor: Actor, memberNos: string[]): Promise<{ memberNo: string; id: string | null; name: string | null }[]> {
  if (!actor.memberId || !isSelf(actor, actor.memberId)) throw new PermissionError("Only members can name guarantors this way");
  const wanted = [...new Set(memberNos.map((n) => n.trim().toUpperCase()).filter(Boolean))].slice(0, 5);
  if (!wanted.length) return [];
  const found = await tx
    .select({ id: members.id, memberNo: members.memberNo, fullName: members.fullName, status: members.status })
    .from(members)
    .where(and(eq(members.societyId, actor.societyId), inArray(sql`upper(${members.memberNo})`, wanted)));
  return wanted.map((n) => {
    const m = found.find((f) => f.memberNo.toUpperCase() === n && f.status === "active" && f.id !== actor.memberId);
    return { memberNo: n, id: m?.id ?? null, name: m?.fullName ?? null };
  });
}
