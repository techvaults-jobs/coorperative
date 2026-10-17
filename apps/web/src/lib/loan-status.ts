import type { Tone } from "@/components/ui/badge";

export const LOAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  applied: { label: "Awaiting decision", tone: "info" },
  approved: { label: "Approved, to disburse", tone: "accent" },
  disbursing: { label: "Disbursement awaiting approval", tone: "warning" },
  active: { label: "Active", tone: "good" },
  closed: { label: "Repaid", tone: "neutral" },
  rejected: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};
