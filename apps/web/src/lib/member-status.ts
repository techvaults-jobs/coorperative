import type { Tone } from "@/components/ui/badge";

export const MEMBER_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "good" },
  applicant: { label: "Applicant", tone: "info" },
  suspended: { label: "Suspended", tone: "warning" },
  exiting: { label: "Exiting", tone: "warning" },
  exited: { label: "Exited", tone: "neutral" },
  deceased: { label: "Deceased", tone: "neutral" },
};
