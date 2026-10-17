/**
 * Loan products and repayment schedules.
 *
 * Interest is computed by a small set of named strategies (D-007), never a free-form
 * formula. All amounts are whole kobo; each instalment's interest is rounded half-up and
 * the final instalment absorbs any rounding so principal repaid always equals principal lent.
 * These are configurable defaults pending accountant review, not legal advice.
 */
import { divideRounded, kobo, type Kobo } from "./money.js";

export const INTEREST_METHODS = ["flat", "reducing_balance", "equal_principal"] as const;
export type InterestMethod = (typeof INTEREST_METHODS)[number];

export const INTEREST_METHOD_LABELS: Record<InterestMethod, { label: string; description: string }> = {
  flat: { label: "Flat rate", description: "Interest on the original amount for the whole term, spread evenly." },
  reducing_balance: { label: "Reducing balance (equal instalments)", description: "Interest on what's still owed; every instalment is the same." },
  equal_principal: { label: "Reducing balance (equal principal)", description: "Interest on what's still owed; principal is repaid evenly, so instalments fall over time." },
};

export interface LoanPolicy {
  interestMethod: InterestMethod;
  /** Annual rate in basis points: 1200 = 12% a year. */
  annualRateBps: number;
  minTermMonths: number;
  maxTermMonths: number;
  /** Kobo. */
  minAmount: Kobo;
  maxAmount: Kobo;
  /** Most a member may borrow as a multiple of their savings (e.g. 2 = twice savings). Null for no limit. */
  savingsMultiple: number | null;
  guarantorsRequired: number;
  /** Deducted from the amount paid out, in basis points of the principal. */
  processingFeeBps: number;
  minMembershipMonths: number;
  /** Loans of this product a member may have running at once. */
  maxActiveLoans: number;
}

/** Policies are stored as JSON, where bigints are decimal strings. */
export type StoredLoanPolicy = Omit<LoanPolicy, "minAmount" | "maxAmount"> & { minAmount: string; maxAmount: string };

export function storeLoanPolicy(p: LoanPolicy): StoredLoanPolicy {
  return { ...p, minAmount: p.minAmount.toString(), maxAmount: p.maxAmount.toString() };
}

export function loadLoanPolicy(p: StoredLoanPolicy): LoanPolicy {
  return { ...p, minAmount: kobo(BigInt(p.minAmount)), maxAmount: kobo(BigInt(p.maxAmount)) };
}

const int = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

/** Every problem with a proposed policy, in plain words. Empty means valid. */
export function validateLoanPolicy(p: LoanPolicy): string[] {
  const errors: string[] = [];
  if (!(INTEREST_METHODS as readonly string[]).includes(p.interestMethod)) errors.push("Choose an interest method.");
  if (!int(p.annualRateBps, 0, 10_000)) errors.push("The annual rate must be between 0% and 100%.");
  if (!int(p.minTermMonths, 1, 120) || !int(p.maxTermMonths, 1, 120)) errors.push("Terms must be between 1 and 120 months.");
  else if (p.minTermMonths > p.maxTermMonths) errors.push("The shortest term can't be longer than the longest.");
  if (p.minAmount <= 0n) errors.push("The smallest loan must be more than ₦0.");
  if (p.maxAmount < p.minAmount) errors.push("The largest loan can't be smaller than the smallest.");
  if (p.savingsMultiple !== null && !(typeof p.savingsMultiple === "number" && p.savingsMultiple > 0 && p.savingsMultiple <= 20)) {
    errors.push("The savings multiple must be between 0 and 20, or none.");
  }
  if (!int(p.guarantorsRequired, 0, 5)) errors.push("Guarantors required must be 0 to 5.");
  if (!int(p.processingFeeBps, 0, 1_000)) errors.push("The processing fee must be between 0% and 10%.");
  if (!int(p.minMembershipMonths, 0, 120)) errors.push("Minimum membership must be 0 to 120 months.");
  if (!int(p.maxActiveLoans, 1, 10)) errors.push("Running loans allowed must be 1 to 10.");
  return errors;
}

// ---------------------------------------------------------------------------
// Schedules

export interface Instalment {
  number: number;
  dueDate: string;
  principal: Kobo;
  interest: Kobo;
  payment: Kobo;
  /** Principal still owed after this instalment. */
  balance: Kobo;
}

export interface Schedule {
  instalments: Instalment[];
  totalInterest: Kobo;
  totalRepayable: Kobo;
}

/** Add whole months to a YYYY-MM-DD date, keeping the day where possible (31 Jan + 1 → 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

// Monthly rate = bps / 10_000 / 12 = bps / 120_000, kept as an exact fraction.
const MONTH_DENOMINATOR = 120_000n;

/** One month's interest on `balance` at `annualRateBps`, rounded half-up to the kobo. */
export function monthlyInterest(balance: bigint, annualRateBps: number): bigint {
  return divideRounded(balance * BigInt(annualRateBps), MONTH_DENOMINATOR, "half-up");
}

/**
 * The repayment schedule for `principal` over `termMonths`, first payment due `firstDueDate`
 * and monthly after that.
 */
export function buildSchedule(principal: Kobo, termMonths: number, method: InterestMethod, annualRateBps: number, firstDueDate: string): Schedule {
  if (principal <= 0n) throw new RangeError("Principal must be more than zero");
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120) throw new RangeError("Term must be 1–120 months");
  const n = BigInt(termMonths);
  const rate = BigInt(annualRateBps);
  const rows: Instalment[] = [];
  let balance: bigint = principal;

  if (method === "flat") {
    const totalInterest = divideRounded(principal * rate * n, MONTH_DENOMINATOR, "half-up");
    const basePrincipal = principal / n;
    const baseInterest = totalInterest / n;
    for (let i = 1; i <= termMonths; i++) {
      const last = i === termMonths;
      const p = last ? balance : basePrincipal;
      const int = last ? totalInterest - baseInterest * (n - 1n) : baseInterest;
      balance -= p;
      rows.push(row(i, firstDueDate, p, int, balance));
    }
  } else if (method === "equal_principal") {
    const basePrincipal = principal / n;
    for (let i = 1; i <= termMonths; i++) {
      const int = monthlyInterest(balance, annualRateBps);
      const p = i === termMonths ? balance : basePrincipal;
      balance -= p;
      rows.push(row(i, firstDueDate, p, int, balance));
    }
  } else {
    // Annuity: payment = P·r·(1+r)^n / ((1+r)^n − 1), with r = bps / 120000.
    let payment: bigint;
    if (rate === 0n) payment = divideRounded(principal, n, "up");
    else {
      const grow = (MONTH_DENOMINATOR + rate) ** n;
      const base = MONTH_DENOMINATOR ** n;
      payment = divideRounded(principal * rate * grow, MONTH_DENOMINATOR * (grow - base), "half-up");
    }
    for (let i = 1; i <= termMonths; i++) {
      const int = monthlyInterest(balance, annualRateBps);
      const p = i === termMonths ? balance : payment - int > balance ? balance : payment - int;
      balance -= p;
      rows.push(row(i, firstDueDate, p, int, balance));
    }
  }

  const totalInterest = rows.reduce((s, r) => s + r.interest, 0n);
  return { instalments: rows, totalInterest: kobo(totalInterest), totalRepayable: kobo(principal + totalInterest) };
}

function row(i: number, firstDueDate: string, principal: bigint, interest: bigint, balance: bigint): Instalment {
  return {
    number: i,
    dueDate: addMonths(firstDueDate, i - 1),
    principal: kobo(principal),
    interest: kobo(interest),
    payment: kobo(principal + interest),
    balance: kobo(balance),
  };
}

/** The processing fee deducted at disbursement. */
export function processingFee(principal: Kobo, policy: Pick<LoanPolicy, "processingFeeBps">): Kobo {
  return kobo(divideRounded(principal * BigInt(policy.processingFeeBps), 10_000n, "half-up"));
}

// ---------------------------------------------------------------------------
// Eligibility

export interface Applicant {
  status: string;
  /** YYYY-MM-DD, or null if unknown. */
  joinedOn: string | null;
  savings: Kobo;
  /** Loans of this product the member already has running. */
  activeLoansOfProduct: number;
}

export interface EligibilityCheck {
  key: "status" | "membership" | "amount" | "savings" | "term" | "guarantors" | "running";
  label: string;
  ok: boolean;
  detail: string;
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

const naira = (k: bigint) => `₦${(Number(k) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Every rule the request is checked against, passed or not, so officers see why. */
export function checkEligibility(
  policy: LoanPolicy,
  applicant: Applicant,
  request: { amount: Kobo; termMonths: number; guarantors: number },
  asOf: string,
): { eligible: boolean; checks: EligibilityCheck[] } {
  const checks: EligibilityCheck[] = [];
  checks.push({ key: "status", label: "Member is active", ok: applicant.status === "active", detail: `Status: ${applicant.status}` });
  const months = applicant.joinedOn ? monthsBetween(applicant.joinedOn, asOf) : 0;
  checks.push({
    key: "membership",
    label: `Member for at least ${policy.minMembershipMonths} month${policy.minMembershipMonths === 1 ? "" : "s"}`,
    ok: months >= policy.minMembershipMonths,
    detail: applicant.joinedOn ? `${months} month${months === 1 ? "" : "s"} so far` : "Join date not recorded",
  });
  checks.push({
    key: "amount",
    label: `Between ${naira(policy.minAmount)} and ${naira(policy.maxAmount)}`,
    ok: request.amount >= policy.minAmount && request.amount <= policy.maxAmount,
    detail: `Requested ${naira(request.amount)}`,
  });
  if (policy.savingsMultiple !== null) {
    const limit = divideRounded(applicant.savings * BigInt(Math.round(policy.savingsMultiple * 100)), 100n, "down");
    checks.push({
      key: "savings",
      label: `At most ${policy.savingsMultiple}× savings`,
      ok: request.amount <= limit,
      detail: `Savings ${naira(applicant.savings)}, limit ${naira(limit)}`,
    });
  }
  checks.push({
    key: "term",
    label: `Term of ${policy.minTermMonths}–${policy.maxTermMonths} months`,
    ok: request.termMonths >= policy.minTermMonths && request.termMonths <= policy.maxTermMonths,
    detail: `Requested ${request.termMonths} months`,
  });
  if (policy.guarantorsRequired > 0) {
    checks.push({
      key: "guarantors",
      label: `${policy.guarantorsRequired} guarantor${policy.guarantorsRequired === 1 ? "" : "s"}`,
      ok: request.guarantors >= policy.guarantorsRequired,
      detail: `${request.guarantors} named`,
    });
  }
  checks.push({
    key: "running",
    label: `No more than ${policy.maxActiveLoans} running loan${policy.maxActiveLoans === 1 ? "" : "s"} of this type`,
    ok: applicant.activeLoansOfProduct < policy.maxActiveLoans,
    detail: `${applicant.activeLoansOfProduct} running now`,
  });
  return { eligible: checks.every((c) => c.ok), checks };
}

/** A sensible starting policy for a new loan product; every value is the society's to change. */
export const DEFAULT_LOAN_POLICY: LoanPolicy = {
  interestMethod: "reducing_balance",
  annualRateBps: 1200,
  minTermMonths: 3,
  maxTermMonths: 24,
  minAmount: kobo(1_000_000),
  maxAmount: kobo(100_000_000),
  savingsMultiple: 2,
  guarantorsRequired: 2,
  processingFeeBps: 100,
  minMembershipMonths: 6,
  maxActiveLoans: 1,
};
