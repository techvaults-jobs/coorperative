import { describe, expect, it } from "vitest";
import { addMonths, buildSchedule, checkEligibility, DEFAULT_LOAN_POLICY, loadLoanPolicy, processingFee, storeLoanPolicy, validateLoanPolicy, type LoanPolicy } from "./loans.js";
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
