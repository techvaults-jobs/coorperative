import { describe, expect, it } from "vitest";
import { checkCash, isIsoDate, meetingDateProblem, nextMeetingDate, weekdayOf } from "./collections.js";
import { parseNaira } from "./money.js";

describe("meeting dates", () => {
  it("reads real dates only", () => {
    expect(isIsoDate("2025-04-01")).toBe(true);
    expect(isIsoDate("2025-02-30")).toBe(false);
    expect(isIsoDate("15/4/25")).toBe(false);
  });

  it("finds the next meeting day", () => {
    expect(weekdayOf("2025-04-01")).toBe(2); // a Tuesday
    expect(nextMeetingDate(2, "2025-04-01")).toBe("2025-04-01");
    expect(nextMeetingDate(1, "2025-04-01")).toBe("2025-04-07");
    expect(nextMeetingDate(1, "2025-12-30")).toBe("2026-01-05");
  });

  it("refuses future dates and dates off the meeting day", () => {
    expect(meetingDateProblem("2025-04-07", 1, "2025-04-07")).toBeNull();
    expect(meetingDateProblem("2025-04-14", 1, "2025-04-07")).toMatch(/before it happens/);
    expect(meetingDateProblem("2025-04-08", 1, "2025-04-30")).toMatch(/Mondays, and 2025-04-08 is a Tuesday/);
    expect(meetingDateProblem("2025-04-08", null, "2025-04-30")).toBeNull();
    expect(meetingDateProblem("", 1, "2025-04-30")).toMatch(/Choose/);
  });
});

describe("cash check", () => {
  it("names money over and short", () => {
    const recorded = parseNaira("52000");
    expect(checkCash(recorded, parseNaira("40000"), parseNaira("12000")).difference).toBe(0n);
    expect(checkCash(recorded, parseNaira("39500"), parseNaira("12000")).difference).toBe(parseNaira("-500"));
    expect(checkCash(recorded, parseNaira("41000"), parseNaira("12000")).difference).toBe(parseNaira("1000"));
  });
});
