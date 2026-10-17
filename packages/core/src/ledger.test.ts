import { describe, expect, it } from "vitest";
import { balance, LedgerError, reversalOf, validateEntry, type JournalEntryDraft } from "./ledger.js";
import { parseNaira } from "./money.js";

const contribution: JournalEntryDraft = {
  societyId: "soc_1",
  entryDate: "2026-10-31",
  description: "October payroll remittance – M-001 ordinary savings",
  idempotencyKey: "payroll-2026-10-M-001",
  lines: [
    { accountId: "bank", side: "debit", amount: parseNaira("15000") },
    { accountId: "member_savings", side: "credit", amount: parseNaira("10000"), memberId: "M-001" },
    { accountId: "member_shares", side: "credit", amount: parseNaira("5000"), memberId: "M-001" },
  ],
};

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof LedgerError ? e.code : "OTHER";
  }
  return undefined;
}

describe("validateEntry", () => {
  it("accepts a balanced entry", () => {
    expect(() => validateEntry(contribution)).not.toThrow();
  });

  it("rejects unbalanced entries", () => {
    const bad = { ...contribution, lines: contribution.lines.slice(0, 2) };
    expect(codeOf(() => validateEntry(bad))).toBe("UNBALANCED");
  });

  it("rejects a single-line entry", () => {
    expect(codeOf(() => validateEntry({ ...contribution, lines: contribution.lines.slice(0, 1) }))).toBe("TOO_FEW_LINES");
  });

  it("rejects zero and negative amounts", () => {
    const zero = {
      ...contribution,
      lines: [...contribution.lines, { accountId: "fees", side: "credit" as const, amount: parseNaira("0") }],
    };
    expect(codeOf(() => validateEntry(zero))).toBe("NON_POSITIVE_AMOUNT");
  });

  it("requires an idempotency key, description and valid date", () => {
    expect(codeOf(() => validateEntry({ ...contribution, idempotencyKey: " " }))).toBe("MISSING_IDEMPOTENCY_KEY");
    expect(codeOf(() => validateEntry({ ...contribution, description: "" }))).toBe("MISSING_DESCRIPTION");
    expect(codeOf(() => validateEntry({ ...contribution, entryDate: "31/10/2026" }))).toBe("INVALID_DATE");
    expect(codeOf(() => validateEntry({ ...contribution, entryDate: "2026-13-45" }))).toBe("INVALID_DATE");
  });
});

describe("reversalOf", () => {
  it("mirrors every line and links to the original", () => {
    const reversal = reversalOf(
      { ...contribution, id: "je_1" },
      { entryDate: "2026-11-02", reason: "Posted to wrong member", idempotencyKey: "rev-je_1" },
    );
    expect(reversal.reversesEntryId).toBe("je_1");
    expect(reversal.lines.map((l) => l.side)).toEqual(["credit", "debit", "debit"]);
    expect(reversal.lines.map((l) => l.amount)).toEqual(contribution.lines.map((l) => l.amount));
    // Original plus reversal nets every account to zero.
    const all = [...contribution.lines, ...reversal.lines];
    for (const account of ["bank", "member_savings", "member_shares"]) {
      expect(balance("asset", all.filter((l) => l.accountId === account))).toBe(0n);
    }
  });
});

describe("balance", () => {
  it("is positive on the account's normal side", () => {
    expect(balance("asset", contribution.lines.filter((l) => l.accountId === "bank"))).toBe(parseNaira("15000"));
    expect(balance("liability", contribution.lines.filter((l) => l.accountId === "member_savings"))).toBe(
      parseNaira("10000"),
    );
  });
});
