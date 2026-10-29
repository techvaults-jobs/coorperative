import type { Tone } from "@/components/ui/badge";

export const COLLECTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Recording", tone: "neutral" },
  submitted: { label: "Posting awaiting approval", tone: "warning" },
  posted: { label: "Posted", tone: "good" },
};

/** "Mon 7 Apr 2025": dates are shown with their weekday so a wrong meeting day stands out. */
export function meetingLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
