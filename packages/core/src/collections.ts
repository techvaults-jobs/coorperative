/**
 * Collection meetings (D-027): the weekly sheet community societies fill in at their meeting.
 *
 * Meeting dates come from the society's meeting day, never typed free-hand, so a sheet can't be
 * dated 4 January when the meeting was on 1 April. What was recorded on the sheet must equal
 * what was received (cash counted plus transfers); any difference is named and held in suspense.
 */
import { kobo, type Kobo } from "./money.js";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** The money columns of a sheet. Savings and share columns are one per product. */
export type CollectionKind = "savings" | "shares" | "loan" | "interest";

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The first date on or after `from` that falls on `weekday` (0 = Sunday). */
export function nextMeetingDate(weekday: number, from: string): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/** Why a meeting date can't be used, or null when it can. */
export function meetingDateProblem(date: string, meetingWeekday: number | null, today: string): string | null {
  if (!isIsoDate(date)) return "Choose the meeting date.";
  if (date > today) return "A meeting can't be recorded before it happens.";
  if (meetingWeekday !== null && weekdayOf(date) !== meetingWeekday) {
    return `Meetings are on ${WEEKDAYS[meetingWeekday]}s, and ${date} is a ${WEEKDAYS[weekdayOf(date)]}.`;
  }
  return null;
}

export interface CashCheck {
  recorded: Kobo;
  received: Kobo;
  /** Received minus recorded: positive is money over, negative is money short. */
  difference: Kobo;
}

export function checkCash(recorded: Kobo, cashCounted: Kobo, transfers: Kobo): CashCheck {
  const received = kobo(cashCounted + transfers);
  return { recorded, received, difference: kobo(received - recorded) };
}
