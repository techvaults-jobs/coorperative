import { describe, expect, it } from "vitest";
import { kobo, parseNaira } from "./money.js";
import { allocateRemittance, parseCsvLine, parseRemittanceCsv, periodEnd, toCsv, type ScheduledItem } from "./payroll.js";

const items: ScheduledItem[] = [
  { key: "sav", kind: "savings", scheduled: parseNaira("10000") },
  { key: "shr", kind: "shares", scheduled: parseNaira("5000") },
  { key: "loan", kind: "loan", scheduled: parseNaira("8000") },
];
const sum = (m: Map<string, bigint>) => [...m.values()].reduce((a, b) => a + b, 0n);

describe("allocation", () => {
  it("covers everything when the full amount arrives, keeping any excess separate", () => {
    const a = allocateRemittance(items, parseNaira("25000"), "loans_first");
    expect(Object.fromEntries(a.allocations)).toEqual({ sav: parseNaira("10000"), shr: parseNaira("5000"), loan: parseNaira("8000") });
    expect(a.excess).toBe(parseNaira("2000"));
    expect(a.shortfall).toBe(0n);
  });

  it("loans first: a shortfall falls on contributions, loan before savings before shares", () => {
    const a = allocateRemittance(items, parseNaira("15000"), "loans_first");
    expect(Object.fromEntries(a.allocations)).toEqual({ loan: parseNaira("8000"), sav: parseNaira("7000"), shr: 0n });
    expect(a.shortfall).toBe(parseNaira("8000"));
  });

  it("pro rata: shares the shortfall, exact to the kobo", () => {
    const a = allocateRemittance(items, kobo(1_000_001), "pro_rata");
    expect(sum(a.allocations)).toBe(1_000_001n);
    expect(a.allocations.get("sav")! > a.allocations.get("shr")!).toBe(true);
  });

  it("handles nothing remitted and nothing scheduled", () => {
    expect(allocateRemittance(items, kobo(0), "pro_rata").shortfall).toBe(parseNaira("23000"));
    expect(allocateRemittance([], parseNaira("500"), "loans_first").excess).toBe(parseNaira("500"));
  });
});

describe("CSV", () => {
  it("parses quoted fields", () => {
    expect(parseCsvLine('DS/1001,"Okonkwo, Adaeze","15,000.00"')).toEqual(["DS/1001", "Okonkwo, Adaeze", "15,000.00"]);
    expect(parseCsvLine('a,"say ""hi""",c')).toEqual(["a", 'say "hi"', "c"]);
  });

  it("writes CSV that round-trips and can't run as a spreadsheet formula", () => {
    const csv = toCsv([["Staff ID", "Name", "Total"], ["DS/1001", "Okonkwo, Adaeze", "15000.00"], ["=HYPERLINK(1)", "x", "-5"]]);
    expect(csv.split("\r\n")[1]).toBe('DS/1001,"Okonkwo, Adaeze",15000.00');
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain(",-5");
  });

  it("reads a remittance file with recognised headers and reports bad lines", () => {
    const r = parseRemittanceCsv('﻿Staff_ID,Full Name,Amount Deducted\r\nDS/1001,"Okonkwo, Adaeze","15,000.00"\r\nDS/1002,Babatunde,abc\r\n,No id,100\r\n\r\nDS/1003,Chiamaka,₦12500.5\r\n');
    expect(r.rows).toEqual([
      { line: 2, externalId: "DS/1001", name: "Okonkwo, Adaeze", amount: parseNaira("15000") },
      { line: 6, externalId: "DS/1003", name: "Chiamaka", amount: parseNaira("12500.50") },
    ]);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it("refuses a file without ID and amount headers", () => {
    expect(parseRemittanceCsv("foo,bar\n1,2").errors[0]!.message).toMatch(/ID column/);
  });

  it("finds the end of a period", () => {
    expect(periodEnd("2026-02")).toBe("2026-02-28");
    expect(periodEnd("2026-12")).toBe("2026-12-31");
  });
});
