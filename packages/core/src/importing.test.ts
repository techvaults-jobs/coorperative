import { describe, expect, it } from "vitest";
import { parseDate, parseMembersCsv, parseOpeningBalancesCsv } from "./importing.js";
import { parseNaira } from "./money.js";

describe("dates", () => {
  it("reads day-first and ISO dates, refusing impossible ones", () => {
    expect(parseDate("05/01/2024")).toBe("2024-01-05");
    expect(parseDate("5.1.2024")).toBe("2024-01-05");
    expect(parseDate("2024-01-05")).toBe("2024-01-05");
    expect(parseDate("31/02/2024")).toBeNull();
    expect(parseDate("Jan 5 2024")).toBeNull();
  });
});

describe("member register import", () => {
  it("recognises common headings and reports every bad line", () => {
    const csv = [
      "Member No,Name,Staff ID,Department,GSM,Email,Date Joined,Status",
      'M-001,"Okonkwo, Adaeze",DS/1001,Bursary,0803 000 0000,ADA@EXAMPLE.NG,05/01/2024,',
      "M-002,Bola,DS/1002,Works,,not-an-email,31/02/2024,",
      "M-001,Duplicate,DS/1003,,,,,",
      "M-004,Chidi Eze,ds/1001,,,,,exited",
      ",,,,,,,",
      "M-005,Femi Ajayi,,,,,,retired",
    ].join("\n");
    const r = parseMembersCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ memberNo: "M-001", fullName: "Okonkwo, Adaeze", externalId: "DS/1001", group: "Bursary", email: "ada@example.ng", joinedOn: "2024-01-05", status: "active" });
    expect(r.issues.map((i) => i.line)).toEqual([3, 4, 5, 7]);
    expect(r.issues[0]!.message).toMatch(/isn't an email.*isn't a date/);
    expect(r.issues[2]!.message).toMatch(/ID ds\/1001 also on line 2/);
    expect(r.issues[3]!.message).toMatch(/unknown status/);
  });

  it("accepts the society's own words for the ID and group columns", () => {
    const r = parseMembersCsv("Member no,Full name,Member ID,Faculty or unit\nM-1,Ada Obi,X-77,Science\n", { externalId: "Member ID", group: "Faculty or unit" });
    expect(r.rows[0]).toMatchObject({ memberNo: "M-1", externalId: "X-77", group: "Science" });
  });

  it("needs member number and name columns", () => {
    expect(parseMembersCsv("Name,Phone\nA,1").issues[0]!.message).toMatch(/Member no/);
  });
});

describe("opening balances import", () => {
  it("reads one column per account code", () => {
    const r = parseOpeningBalancesCsv("Member no,2100 Savings,3100,Notes\nM-001,\"125,000.50\",20000,x\nM-002,,5000\nM-003,,\nM-004,-5,\nM-002,1,1\n");
    expect(r.accountCodes).toEqual(["2100", "3100"]);
    expect(r.rows.map((x) => [x.memberNo, Object.fromEntries(x.amounts)])).toEqual([
      ["M-001", { "2100": parseNaira("125000.50"), "3100": parseNaira("20000") }],
      ["M-002", { "3100": parseNaira("5000") }],
    ]);
    expect(r.issues.map((i) => i.line)).toEqual([5, 6]);
  });
});

describe("running loans import", () => {
  it("reads loans and reports bad lines", async () => {
    const { parseLegacyLoansCsv } = await import("./importing.js");
    const r = parseLegacyLoansCsv("Member no,Product code,Outstanding,Remaining months,Next due date\nM-1,reg-loan,\"91,329.65\",9,31/10/2026\nM-2,REG-LOAN,0,9,31/10/2026\nM-3,REG-LOAN,100,200,31/10/2026\n");
    expect(r.rows).toEqual([{ line: 2, memberNo: "M-1", productCode: "REG-LOAN", outstanding: parseNaira("91329.65"), remainingMonths: 9, nextDue: "2026-10-31" }]);
    expect(r.issues.map((i) => i.line)).toEqual([3, 4]);
  });
});
