import type { Tone } from "@/components/ui/badge";

export const INTEREST_MONTH_STATUS: Record<string, { label: string; tone: Tone }> = {
  posted: { label: "Charged", tone: "good" },
  submitted: { label: "Waiting for approval", tone: "warning" },
  due: { label: "To charge", tone: "accent" },
  open: { label: "Month in progress", tone: "neutral" },
};

/** "2026-08" → "August 2026". */
export const monthName = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
