import type { Role } from "@techvaults/core";

export const ROLE_LABELS: Record<Role, string> = {
  principal_officer: "Principal officer",
  chairperson: "Chairperson",
  secretary: "Secretary",
  treasurer: "Treasurer",
  loan_officer: "Loan officer",
  loan_committee: "Loan committee",
  payroll_officer: "Payroll officer",
  auditor: "Auditor",
  member: "Member",
};

/** One line on what each officer role can do, shown when roles are chosen. */
export const ROLE_HINTS: Partial<Record<Role, string>> = {
  principal_officer: "Approves entries and settings; manages officers",
  chairperson: "Approves entries, loans and settings",
  secretary: "Keeps the member register; manages officers",
  treasurer: "Prepares journal entries and reversals",
  loan_officer: "Prepares loan applications",
  loan_committee: "Approves loans",
  payroll_officer: "Manages payroll deduction files",
  auditor: "Read-only access to the ledger and audit trail",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}
