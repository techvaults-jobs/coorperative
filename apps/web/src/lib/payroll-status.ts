import type { Tone } from "@/components/ui/badge";

export const RUN_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft schedule", tone: "neutral" },
  issued: { label: "Sent to employer", tone: "info" },
  reconciled: { label: "Remittance reconciled", tone: "warning" },
  submitted: { label: "Posting awaiting approval", tone: "warning" },
  posted: { label: "Posted", tone: "good" },
};
