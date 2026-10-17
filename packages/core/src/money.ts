/**
 * Money is held as an integer number of kobo (1 naira = 100 kobo) in a bigint.
 * Floats never touch monetary values. Every operation that can produce a fraction
 * of a kobo takes an explicit rounding mode, so the rounding rule a society uses
 * is a recorded policy rather than an accident of arithmetic.
 */

declare const koboBrand: unique symbol;
export type Kobo = bigint & { readonly [koboBrand]: true };

export const KOBO_PER_NAIRA = 100n;
export const ZERO = 0n as Kobo;

export type RoundingMode = "half-up" | "half-even" | "down" | "up";

export function kobo(value: bigint | number): Kobo {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError(`kobo() requires an integer, got ${value}`);
  }
  return BigInt(value) as Kobo;
}

const NAIRA_PATTERN = /^(-)?(\d{1,15})(?:\.(\d{1,2}))?$/;

/** Parse a naira amount written as a decimal string, e.g. "1250.50" or "-3,000". */
export function parseNaira(input: string): Kobo {
  const cleaned = input.trim().replace(/[₦,\s]/g, "");
  const match = NAIRA_PATTERN.exec(cleaned);
  if (!match) throw new SyntaxError(`Not a valid naira amount: "${input}"`);
  const [, sign, whole, fraction = ""] = match;
  const value = BigInt(whole!) * KOBO_PER_NAIRA + BigInt(fraction.padEnd(2, "0"));
  return (sign ? -value : value) as Kobo;
}

/** Format for display, e.g. ₦1,250.50 or -₦3,000.00. */
export function formatNaira(amount: Kobo, opts: { symbol?: boolean } = {}): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = (abs / KOBO_PER_NAIRA).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (abs % KOBO_PER_NAIRA).toString().padStart(2, "0");
  const symbol = opts.symbol === false ? "" : "₦";
  return `${negative ? "-" : ""}${symbol}${whole}.${fraction}`;
}

export function add(...amounts: Kobo[]): Kobo {
  return amounts.reduce<bigint>((sum, a) => sum + a, 0n) as Kobo;
}

export function subtract(a: Kobo, b: Kobo): Kobo {
  return (a - b) as Kobo;
}

export function negate(a: Kobo): Kobo {
  return -a as Kobo;
}

export function abs(a: Kobo): Kobo {
  return (a < 0n ? -a : a) as Kobo;
}

/** Integer division of `numerator / denominator` with an explicit rounding mode. */
export function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const quotient = numerator / denominator; // truncates toward zero
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;

  const sign = numerator < 0n ? -1n : 1n;
  const twiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  switch (mode) {
    case "down":
      return quotient;
    case "up":
      return quotient + sign;
    case "half-up":
      return twiceRemainder >= denominator ? quotient + sign : quotient;
    case "half-even": {
      if (twiceRemainder > denominator) return quotient + sign;
      if (twiceRemainder < denominator) return quotient;
      return quotient % 2n === 0n ? quotient : quotient + sign;
    }
  }
}

/**
 * Apply a rate given in basis points (1 bp = 0.01%), e.g. 250 bp = 2.5%.
 * Basis points keep rates exact without floats.
 */
export function applyRateBps(amount: Kobo, rateBps: bigint, mode: RoundingMode): Kobo {
  return divideRounded(amount * rateBps, 10_000n, mode) as Kobo;
}

/**
 * Split an amount into parts proportional to `weights`, with no kobo lost or created.
 * Leftover kobo go to the parts with the largest fractional remainders (largest-remainder
 * method), ties broken by position, so the result is deterministic and always sums exactly.
 */
export function allocate(amount: Kobo, weights: readonly bigint[]): Kobo[] {
  if (weights.length === 0) throw new RangeError("allocate() needs at least one weight");
  if (weights.some((w) => w < 0n)) throw new RangeError("Weights must not be negative");
  const total = weights.reduce((s, w) => s + w, 0n);
  if (total === 0n) throw new RangeError("Weights must not all be zero");

  const sign = amount < 0n ? -1n : 1n;
  const magnitude = amount * sign;
  const shares = weights.map((w, index) => ({
    index,
    base: (magnitude * w) / total,
    remainder: (magnitude * w) % total,
  }));
  let leftover = magnitude - shares.reduce((s, p) => s + p.base, 0n);
  const order = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  const result = shares.map((s) => s.base);
  for (const share of order) {
    if (leftover === 0n) break;
    result[share.index]! += 1n;
    leftover -= 1n;
  }
  return result.map((v) => (v * sign) as Kobo);
}
