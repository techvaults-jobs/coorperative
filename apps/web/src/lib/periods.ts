/** Date helpers for report periods. Dates are YYYY-MM-DD strings in the society's local calendar. */

export const todayIso = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10); // Africa/Lagos is UTC+1

/** Start of the financial year containing `asOf`, for a year starting in month `startMonth` (1–12). */
export function financialYearStart(asOf: string, startMonth: number): string {
  const [y, m] = asOf.split("-").map(Number) as [number, number];
  const year = m >= startMonth ? y : y - 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const validDate = (v: string | undefined, fallback: string) => (v && ISO.test(v) && !Number.isNaN(Date.parse(v)) ? v : fallback);

export const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
