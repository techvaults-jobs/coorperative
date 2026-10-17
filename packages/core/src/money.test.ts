import { describe, expect, it } from "vitest";
import { add, allocate, applyRateBps, divideRounded, formatNaira, kobo, parseNaira, subtract } from "./money.js";

describe("parseNaira / formatNaira", () => {
  it.each([
    ["0", 0n],
    ["1", 100n],
    ["1250.5", 125050n],
    ["₦1,250.50", 125050n],
    ["-3,000", -300000n],
    ["0.01", 1n],
  ])("parses %s", (input, expected) => {
    expect(parseNaira(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "1,25.0.0", "1e5"])("rejects %s", (input) => {
    expect(() => parseNaira(input)).toThrow(SyntaxError);
  });

  it("formats with grouping and two decimals", () => {
    expect(formatNaira(kobo(125050))).toBe("₦1,250.50");
    expect(formatNaira(kobo(-300000))).toBe("-₦3,000.00");
    expect(formatNaira(kobo(5))).toBe("₦0.05");
    expect(formatNaira(kobo(123456789012n), { symbol: false })).toBe("1,234,567,890.12");
  });

  it("round-trips", () => {
    for (const s of ["0.00", "1.01", "999,999.99", "-12.30"]) {
      expect(formatNaira(parseNaira(s), { symbol: false })).toBe(s);
    }
  });
});

describe("arithmetic", () => {
  it("does exact sums where floats would drift", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in kobo it is exactly 30.
    expect(add(parseNaira("0.10"), parseNaira("0.20"))).toBe(30n);
    expect(subtract(kobo(100), kobo(250))).toBe(-150n);
  });
});

describe("divideRounded", () => {
  it.each([
    // numerator, denominator, half-up, half-even, down, up
    [5n, 2n, 3n, 2n, 2n, 3n],
    [7n, 2n, 4n, 4n, 3n, 4n],
    [-5n, 2n, -3n, -2n, -2n, -3n],
    [10n, 3n, 3n, 3n, 3n, 4n],
    [6n, 3n, 2n, 2n, 2n, 2n],
  ])("%d / %d", (n, d, halfUp, halfEven, down, up) => {
    expect(divideRounded(n, d, "half-up")).toBe(halfUp);
    expect(divideRounded(n, d, "half-even")).toBe(halfEven);
    expect(divideRounded(n, d, "down")).toBe(down);
    expect(divideRounded(n, d, "up")).toBe(up);
  });

  it("rejects division by zero", () => {
    expect(() => divideRounded(1n, 0n, "half-up")).toThrow(RangeError);
  });
});

describe("applyRateBps", () => {
  it("computes 1% monthly interest on ₦100,000 as ₦1,000", () => {
    expect(applyRateBps(parseNaira("100000"), 100n, "half-up")).toBe(parseNaira("1000"));
  });

  it("rounds a fractional kobo by the given mode", () => {
    // 2.5% of ₦0.15 = 0.375 kobo
    expect(applyRateBps(kobo(15), 250n, "half-up")).toBe(0n);
    expect(applyRateBps(kobo(15), 250n, "up")).toBe(1n);
  });
});

describe("allocate", () => {
  it("never loses or creates a kobo", () => {
    const parts = allocate(kobo(100), [1n, 1n, 1n]);
    expect(parts).toEqual([34n, 33n, 33n]);
    expect(add(...parts)).toBe(100n);
  });

  it("splits proportionally", () => {
    // ₦10,000 deduction split 60/40 between savings and shares
    expect(allocate(parseNaira("10000"), [60n, 40n])).toEqual([600000n, 400000n]);
  });

  it("gives leftovers to the largest remainders", () => {
    expect(allocate(kobo(10), [1n, 2n, 3n])).toEqual([2n, 3n, 5n]);
  });

  it("handles negative amounts symmetrically", () => {
    expect(allocate(kobo(-100), [1n, 1n, 1n])).toEqual([-34n, -33n, -33n]);
  });

  it("rejects bad weights", () => {
    expect(() => allocate(kobo(1), [])).toThrow(RangeError);
    expect(() => allocate(kobo(1), [0n, 0n])).toThrow(RangeError);
    expect(() => allocate(kobo(1), [-1n, 2n])).toThrow(RangeError);
  });

  it("sums exactly over many random cases", () => {
    let seed = 42;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % max;
    };
    for (let i = 0; i < 500; i++) {
      const amount = kobo(rand(10_000_000));
      const weights = Array.from({ length: 1 + rand(6) }, () => BigInt(1 + rand(1000)));
      expect(add(...allocate(amount, weights))).toBe(amount);
    }
  });
});
