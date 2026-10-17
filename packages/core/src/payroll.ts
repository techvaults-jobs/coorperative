/**
 * Payroll deductions: allocating what an employer remitted for a member across that member's
 * scheduled items, and reading and writing the CSV files employers exchange.
 *
 * The order in which a shortfall is absorbed is a policy question still open in discovery
 * (D-012), so it is a named, selectable strategy. The default is pending validation.
 */
import { divideRounded, kobo, parseNaira, type Kobo } from "./money.js";

export const ALLOCATION_STRATEGIES = ["loans_first", "pro_rata"] as const;
export type AllocationStrategy = (typeof ALLOCATION_STRATEGIES)[number];

export const ALLOCATION_LABELS: Record<AllocationStrategy, { label: string; description: string }> = {
  loans_first: {
    label: "Loans first",
    description: "A shortfall is taken from savings and shares first, so loan repayments are met before contributions.",
  },
  pro_rata: { label: "In proportion", description: "A shortfall is shared across every item in proportion to its scheduled amount." },
};

export type ItemKind = "loan" | "savings" | "shares";
const PRIORITY: Record<ItemKind, number> = { loan: 0, savings: 1, shares: 2 };

export interface ScheduledItem {
  key: string;
  kind: ItemKind;
  scheduled: Kobo;
}

export interface Allocation {
  allocations: Map<string, Kobo>;
  /** Remitted above everything scheduled. */
  excess: Kobo;
  /** Scheduled but not covered. */
  shortfall: Kobo;
}

/**
 * Split `remitted` across a member's scheduled items. Totals are exact: allocations plus excess
 * always equal what was remitted.
 */
export function allocateRemittance(items: readonly ScheduledItem[], remitted: Kobo, strategy: AllocationStrategy): Allocation {
  if (remitted < 0n) throw new RangeError("Remitted amount can't be negative");
  const total = items.reduce((s, i) => s + i.scheduled, 0n);
  const allocations = new Map<string, Kobo>(items.map((i) => [i.key, kobo(0)]));
  if (remitted >= total) {
    for (const i of items) allocations.set(i.key, i.scheduled);
    return { allocations, excess: kobo(remitted - total), shortfall: kobo(0) };
  }
  if (strategy === "loans_first") {
    let left: bigint = remitted;
    for (const i of [...items].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])) {
      const take = left >= i.scheduled ? i.scheduled : left;
      allocations.set(i.key, kobo(take));
      left -= take;
    }
  } else {
    let given = 0n;
    items.forEach((i, idx) => {
      const share = idx === items.length - 1 ? remitted - given : divideRounded(remitted * i.scheduled, total, "down");
      allocations.set(i.key, kobo(share));
      given += share;
    });
  }
  return { allocations, excess: kobo(0), shortfall: kobo(total - remitted) };
}

// ---------------------------------------------------------------------------
// CSV

/** Parse one CSV line, honouring double-quoted fields with embedded commas and quotes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    // Leading =, +, - or @ would run as a formula in a spreadsheet; prefix a quote.
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export interface RemittanceRow {
  line: number;
  externalId: string;
  name: string;
  amount: Kobo;
}

export interface RemittanceParse {
  rows: RemittanceRow[];
  errors: { line: number; message: string }[];
}

const ID_HEADERS = ["staff id", "staffid", "staff no", "staff number", "ippis", "ippis no", "employee id", "member id", "farmer id", "id"];
const AMOUNT_HEADERS = ["amount", "deduction", "total", "total deduction", "amount deducted", "remitted"];
const NAME_HEADERS = ["name", "full name", "staff name", "employee name"];

/**
 * Read an employer's remittance file. The first row must name the ID and amount columns
 * (common spellings are recognised); every other row is one member's deduction.
 */
export function parseRemittanceCsv(text: string): RemittanceParse {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? "").map((h) => h.toLowerCase().replace(/[_.]/g, " ").replace(/\s+/g, " ").trim());
  const idCol = header.findIndex((h) => ID_HEADERS.includes(h));
  const amountCol = header.findIndex((h) => AMOUNT_HEADERS.includes(h));
  const nameCol = header.findIndex((h) => NAME_HEADERS.includes(h));
  if (idCol < 0 || amountCol < 0) {
    return { rows: [], errors: [{ line: 1, message: "The first row must name an ID column (e.g. “Staff ID”) and an amount column (e.g. “Amount”)." }] };
  }
  const rows: RemittanceRow[] = [];
  const errors: RemittanceParse["errors"] = [];
  lines.slice(1).forEach((raw, i) => {
    const line = i + 2;
    if (!raw.trim()) return;
    const cells = parseCsvLine(raw);
    const externalId = cells[idCol] ?? "";
    if (!externalId) return errors.push({ line, message: "No ID" });
    let amount: Kobo;
    try {
      amount = parseNaira(cells[amountCol] ?? "");
    } catch {
      return errors.push({ line, message: `“${cells[amountCol] ?? ""}” isn't an amount` });
    }
    if (amount < 0n) return errors.push({ line, message: "Negative amount" });
    rows.push({ line, externalId, name: nameCol >= 0 ? (cells[nameCol] ?? "") : "", amount });
  });
  return { rows, errors };
}

/** YYYY-MM → last day of that month. */
export function periodEnd(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function isPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
