/**
 * Roles and permissions with separation of duties.
 *
 * Roles here are a starting set from the master prompt §8; discovery will refine them.
 * Two rules are enforced regardless of role: the person who prepared a financial
 * transaction may not approve it, and TechVaults platform staff get no member financial
 * data unless a society has granted time-boxed support access.
 *
 * No role posts to the journal directly. An entry is prepared (ledger.prepare, or
 * ledger.reverse for a correction) and is posted only when a second officer approves it.
 */

export const ROLES = [
  "principal_officer",
  "chairperson",
  "secretary",
  "treasurer",
  "loan_officer",
  "loan_committee",
  "payroll_officer",
  "auditor",
  "member",
] as const;
export type Role = (typeof ROLES)[number];

/** Roles that hold society records or money. Holders must use two-factor authentication. */
export const OFFICER_ROLES = ROLES.filter((r): r is Exclude<Role, "member"> => r !== "member");
export type OfficerRole = (typeof OFFICER_ROLES)[number];

export const PERMISSIONS = [
  "members.read",
  "members.write",
  "ledger.read",
  "ledger.prepare",
  "ledger.approve",
  "ledger.reverse",
  "loans.prepare",
  "loans.approve",
  "payroll.manage",
  "settings.manage",
  "settings.approve",
  "officers.manage",
  "accounts.manage",
  "audit.read",
  "self.read",
  "self.apply",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, readonly Permission[]> = {
  principal_officer: ["members.read", "ledger.read", "ledger.approve", "settings.approve", "officers.manage", "accounts.manage", "audit.read"],
  chairperson: ["members.read", "ledger.read", "ledger.approve", "loans.approve", "settings.approve", "audit.read"],
  secretary: ["members.read", "members.write", "settings.manage", "officers.manage"],
  treasurer: ["members.read", "ledger.read", "ledger.prepare", "ledger.reverse", "loans.prepare", "payroll.manage", "accounts.manage"],
  loan_officer: ["members.read", "loans.prepare", "ledger.read"],
  loan_committee: ["members.read", "loans.approve", "ledger.read"],
  payroll_officer: ["payroll.manage"],
  auditor: ["members.read", "ledger.read", "audit.read"],
  member: ["self.read", "self.apply"],
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  return new Set(roles.flatMap((role) => GRANTS[role]));
}

export function can(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export type ApprovalCheck = { allowed: true } | { allowed: false; reason: string };

/** Maker-checker: approval needs the permission and must come from someone other than the preparer. */
export function canApprove(
  approver: { userId: string; roles: readonly Role[] },
  item: { preparedBy: string },
  permission: Extract<Permission, "ledger.approve" | "loans.approve" | "settings.approve">,
): ApprovalCheck {
  if (!can(approver.roles, permission)) {
    return { allowed: false, reason: `Your role does not include ${permission}` };
  }
  if (approver.userId === item.preparedBy) {
    return { allowed: false, reason: "The person who prepared this cannot also approve it" };
  }
  return { allowed: true };
}

export interface SupportGrant {
  societyId: string;
  grantedBy: string;
  expiresAt: string; // ISO-8601
  scope: "read";
}

/** Platform staff may read a society's data only under an unexpired grant for that society. */
export function platformStaffCanRead(grant: SupportGrant | undefined, societyId: string, now: Date): boolean {
  return !!grant && grant.societyId === societyId && grant.scope === "read" && new Date(grant.expiresAt) > now;
}
