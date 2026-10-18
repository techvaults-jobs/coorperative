import { describe, expect, it } from "vitest";
import { parseNaira } from "./money.js";
import { checkWithdrawal, DEFAULT_SAVINGS_POLICY, earliestPayment } from "./products.js";

describe("withdrawals", () => {
  const base = { memberStatus: "active", balance: parseNaira("50000"), pending: parseNaira("10000"), amount: parseNaira("40000") };

  it("allows up to the balance not already requested", () => {
    expect(checkWithdrawal(DEFAULT_SAVINGS_POLICY, base).allowed).toBe(true);
    const over = checkWithdrawal(DEFAULT_SAVINGS_POLICY, { ...base, amount: parseNaira("40000.01") });
    expect(over.allowed).toBe(false);
    expect(over.checks.find((c) => c.key === "balance")!.detail).toBe("Balance ₦50,000.00, ₦10,000.00 already requested");
  });

  it("only lets members leaving withdraw from exit-only products", () => {
    const exitOnly = { ...DEFAULT_SAVINGS_POLICY, withdrawable: false };
    expect(checkWithdrawal(exitOnly, base).allowed).toBe(false);
    expect(checkWithdrawal(exitOnly, { ...base, memberStatus: "exiting" }).allowed).toBe(true);
    expect(checkWithdrawal(DEFAULT_SAVINGS_POLICY, { ...base, memberStatus: "suspended" }).allowed).toBe(false);
  });

  it("dates payment after the notice period", () => {
    expect(earliestPayment("2026-10-18", 30)).toBe("2026-11-17");
    expect(earliestPayment("2026-12-20", 14)).toBe("2027-01-03");
    expect(earliestPayment("2026-10-18", 0)).toBe("2026-10-18");
  });
});
