import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildSchedule,
  checkEligibility,
  DEFAULT_LOAN_POLICY,
  expectedWeeklyRepayment,
  loadLoanPolicy,
  monthEnd,
  monthlyInterest,
  processingFee,
  storeLoanPolicy,
  termWeeks,
  validateLoanPolicy,
  weeklyProgress,
  type LoanPolicy,
} from "./loans.js";
import { kobo, parseNaira } from "./money.js";

const P = parseNaira("100000");
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

describe("loan schedules", () => {
  it("reducing balance: equal instalments, the textbook figure", () => {
    const s = buildSchedule(P, 12, "reducing_balance", 1200, "2026-11-30");
    expect(s.instalments[0]!.payment).toBe(parseNaira("8884.88"));
    expect(s.instalments[0]!.interest).toBe(parseNaira("1000"));
    expect(s.instalments.slice(0, 11).every((i) => i.payment === parseNaira("8884.88"))).toBe(true);
    expect(sum(s.instalments.map((i) => i.principal))).toBe(P);
    expect(s.instalments.at(-1)!.balance).toBe(0n);
    expect(s.totalRepayable).toBe(P + s.totalInterest);
    // Rounding is absorbed by the last instalment: within a few kobo of the others.
    const last = s.instalments.at(-1)!.payment;
    expect(last > parseNaira("8884.80") && last < parseNaira("8884.95")).toBe(true);
  });

  it("flat rate: interest on the original amount, spread evenly", () => {
    const s = buildSchedule(P, 12, "flat", 1200, "2026-11-30");
    expect(s.totalInterest).toBe(parseNaira("12000"));
    expect(s.instalments[0]).toMatchObject({ principal: parseNaira("8333.33"), interest: parseNaira("1000"), payment: parseNaira("9333.33") });
    expect(s.instalments.at(-1)!.principal).toBe(parseNaira("8333.37"));
    expect(sum(s.instalments.map((i) => i.principal))).toBe(P);
  });

  it("equal principal: instalments fall as the balance does", () => {
    const s = buildSchedule(P, 12, "equal_principal", 1200, "2026-11-30");
    expect(s.instalments[0]!.interest).toBe(parseNaira("1000"));
    expect(s.instalments.at(-1)!.interest).toBe(parseNaira("83.33"));
    expect(s.instalments[0]!.payment > s.instalments.at(-1)!.payment).toBe(true);
    expect(sum(s.instalments.map((i) => i.principal))).toBe(P);
    expect(s.totalInterest).toBe(parseNaira("6500"));
  });

  it("interest-free loans split the principal exactly", () => {
    for (const method of ["flat", "reducing_balance", "equal_principal"] as const) {
      const s = buildSchedule(kobo(1_000_001), 7, method, 0, "2026-01-31");
      expect(s.totalInterest, method).toBe(0n);
      expect(sum(s.instalments.map((i) => i.principal)), method).toBe(1_000_001n);
      expect(s.instalments.every((i) => i.principal > 0n), method).toBe(true);
    }
  });

  it("dates fall monthly and respect short months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 2)).toBe("2027-01-30");
    const s = buildSchedule(P, 3, "flat", 1200, "2026-12-31");
    expect(s.instalments.map((i) => i.dueDate)).toEqual(["2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("refuses impossible inputs", () => {
    expect(() => buildSchedule(kobo(0), 12, "flat", 1200, "2026-01-01")).toThrow();
    expect(() => buildSchedule(P, 0, "flat", 1200, "2026-01-01")).toThrow();
    expect(() => buildSchedule(P, 121, "flat", 1200, "2026-01-01")).toThrow();
  });

  it("charges the processing fee on the principal", () => {
    expect(processingFee(P, { processingFeeBps: 100 })).toBe(parseNaira("1000"));
    expect(processingFee(kobo(333), { processingFeeBps: 150 })).toBe(kobo(5));
  });
});

describe("flexible weekly loans (D-028)", () => {
  const P400 = parseNaira("400000");

  it("charges 1.5% a month on the outstanding balance, as the workbook does", () => {
    // 18% a year is 1.5% a month.
    expect(monthlyInterest(parseNaira("359000"), 1800)).toBe(parseNaira("5385"));
    expect(monthlyInterest(kobo(3_333), 1800)).toBe(kobo(50)); // 49.995 rounds half-up
  });

  it("has no fixed schedule", () => {
    expect(() => buildSchedule(P400, 12, "flexible_weekly", 1800, "2026-11-02")).toThrow(/no fixed schedule/);
  });

  it("expects principal ÷ term in weeks at each meeting", () => {
    expect(termWeeks(12)).toBe(52);
    expect(termWeeks(6)).toBe(26);
    expect(expectedWeeklyRepayment(P400, 12)).toBe(parseNaira("7692.31")); // rounded up
  });

  it("tracks the running total, not each week", () => {
    const weekly = expectedWeeklyRepayment(P400, 12);
    // Third meeting, two weeks' worth paid: one repayment behind since that meeting.
    const p = weeklyProgress(P400, 12, "2026-11-02", 2n * weekly, "2026-11-16");
    expect(p).toMatchObject({ expected: kobo(3n * weekly), behind: weekly, weeksBehind: 1, daysPastDue: 1 });
    expect(p.nextDue).toEqual({ number: 4, dueDate: "2026-11-23", amount: kobo(2n * weekly) });
    // Paying ahead: nothing behind, and the next amount falls on a later meeting.
    const ahead = weeklyProgress(P400, 12, "2026-11-02", 5n * weekly, "2026-11-09");
    expect(ahead).toMatchObject({ behind: 0n, daysPastDue: 0 });
    expect(ahead.nextDue).toEqual({ number: 6, dueDate: "2026-12-07", amount: weekly });
    // Nothing paid for six weeks: overdue since the first meeting.
    expect(weeklyProgress(P400, 12, "2026-11-02", 0n, "2026-12-14").daysPastDue).toBe(42);
  });

  it("never expects more than the principal", () => {
    const p = weeklyProgress(P400, 12, "2025-01-06", parseNaira("390000"), "2026-10-26");
    expect(p.expected).toBe(P400);
    expect(p.behind).toBe(parseNaira("10000"));
    expect(p.nextDue!.amount).toBe(parseNaira("10000"));
    expect(weeklyProgress(P400, 12, "2025-01-06", P400, "2026-10-26").nextDue).toBeNull();
  });

  it("charges on the last day of the month", () => {
    expect(monthEnd("2025-04")).toBe("2025-04-30");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
  });
});

describe("loan policies", () => {
  it("round-trips through storage", () => {
    expect(loadLoanPolicy(storeLoanPolicy(DEFAULT_LOAN_POLICY))).toEqual(DEFAULT_LOAN_POLICY);
    expect(validateLoanPolicy(DEFAULT_LOAN_POLICY)).toEqual([]);
  });

  it("explains every problem with a policy", () => {
    const bad: LoanPolicy = { ...DEFAULT_LOAN_POLICY, annualRateBps: 20_000, minTermMonths: 12, maxTermMonths: 6, maxAmount: kobo(1), guarantorsRequired: 9 };
    const errors = validateLoanPolicy(bad);
    expect(errors).toHaveLength(4);
    expect(errors.join(" ")).toMatch(/rate.*shortest term.*largest loan.*Guarantors/s);
  });
});

describe("eligibility", () => {
  const member = { status: "active", joinedOn: "2025-01-15", savings: parseNaira("80000"), activeLoansOfProduct: 0 };
  const request = { amount: parseNaira("150000"), termMonths: 12, guarantors: 2 };

  it("passes a member within every rule", () => {
    const r = checkEligibility(DEFAULT_LOAN_POLICY, member, request, "2026-10-17");
    expect(r.eligible).toBe(true);
    expect(r.checks.map((c) => c.key)).toEqual(["status", "membership", "amount", "savings", "term", "guarantors", "running"]);
  });

  it("lists each rule that fails, with the reason", () => {
    const r = checkEligibility(
      DEFAULT_LOAN_POLICY,
      { ...member, joinedOn: "2026-08-01", activeLoansOfProduct: 1 },
      { ...request, amount: parseNaira("170000"), guarantors: 1 },
      "2026-10-17",
    );
    expect(r.eligible).toBe(false);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(["membership", "savings", "guarantors", "running"]);
    expect(r.checks.find((c) => c.key === "savings")!.detail).toBe("Savings ₦80,000.00, limit ₦160,000.00");
    expect(r.checks.find((c) => c.key === "membership")!.detail).toBe("2 months so far");
  });

  it("skips rules the product doesn't use", () => {
    const r = checkEligibility({ ...DEFAULT_LOAN_POLICY, savingsMultiple: null, guarantorsRequired: 0 }, member, request, "2026-10-17");
    expect(r.checks.map((c) => c.key)).not.toContain("savings");
    expect(r.checks.map((c) => c.key)).not.toContain("guarantors");
  });
});
