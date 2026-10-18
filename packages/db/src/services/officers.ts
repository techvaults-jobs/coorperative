/**
 * Officers of a society and invitations for new ones. Societies add their own officers:
 * an officer with officers.manage creates an invitation link, which the invitee opens to
 * set a password (or, if they already have an account, to join with it).
 */
import { can, canApproveRoleGrant, isSensitiveGrant, OFFICER_ROLES, ROLES, type OfficerRole, type Role } from "@techvaults/core";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Database, Tx } from "../client.js";
import { accounts, members, officerInvitations, roleGrantRequests, societyUsers, users } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError, type Actor } from "./ledger.js";

export const INVITATION_DAYS = 7;

export class OfficerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficerError";
  }
}

const KNOWN = new Set<string>(OFFICER_ROLES);

function officerRoles(roles: readonly string[]): OfficerRole[] {
  const unique = [...new Set(roles)];
  if (unique.length === 0) throw new OfficerError("Choose at least one role.");
  const unknown = unique.filter((r) => !KNOWN.has(r));
  if (unknown.length) throw new OfficerError(`Unknown role: ${unknown.join(", ")}`);
  // Keep the canonical order so the stored list and the audit trail read consistently.
  return OFFICER_ROLES.filter((r) => unique.includes(r));
}

/**
 * Whether someone other than `exclude` could approve a sensitive role grant in this society.
 * Only people who can sign in count; a placeholder officer with no login can't approve anything.
 */
async function otherApproverExists(tx: Tx, societyId: string, exclude: string[]): Promise<boolean> {
  const rows = await tx
    .selectDistinct({ userId: societyUsers.userId, roles: societyUsers.roles })
    .from(societyUsers)
    .innerJoin(accounts, eq(accounts.userId, societyUsers.userId))
    .where(eq(societyUsers.societyId, societyId));
  return rows.some((r) => !exclude.includes(r.userId) && canApproveRoleGrant(r.roles as Role[]));
}

/** Roles in canonical order, without duplicates or unknown names. */
function sortRoles(roles: readonly string[]): Role[] {
  return ROLES.filter((r) => roles.includes(r));
}

function requireManager(actor: Actor) {
  if (!can(actor.roles, "officers.manage")) throw new PermissionError("Your role cannot manage officers");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface OfficerView {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  twoFactorEnabled: boolean;
}

export async function listOfficers(tx: Tx, actor: Actor): Promise<OfficerView[]> {
  requireManager(actor);
  return tx
    .select({ userId: users.id, name: users.name, email: users.email, roles: societyUsers.roles, twoFactorEnabled: users.twoFactorEnabled })
    .from(societyUsers)
    .innerJoin(users, eq(users.id, societyUsers.userId))
    .where(and(eq(societyUsers.societyId, actor.societyId), sql`${societyUsers.roles} && ${sql.raw(`array[${OFFICER_ROLES.map((r) => `'${r}'`).join(",")}]::text[]`)}`))
    .orderBy(asc(users.name));
}

export interface InvitationView {
  id: string;
  email: string;
  roles: string[];
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
  needsApproval: boolean;
}

/** Invitations not yet accepted or revoked. Expired ones are included so they can be tidied up. */
export async function listOpenInvitations(tx: Tx, actor: Actor): Promise<InvitationView[]> {
  requireManager(actor);
  return tx
    .select({
      id: officerInvitations.id,
      email: officerInvitations.email,
      roles: officerInvitations.roles,
      invitedByName: users.name,
      createdAt: officerInvitations.createdAt,
      expiresAt: officerInvitations.expiresAt,
      needsApproval: officerInvitations.needsApproval,
    })
    .from(officerInvitations)
    .innerJoin(users, eq(users.id, officerInvitations.invitedBy))
    .where(and(isNull(officerInvitations.acceptedAt), isNull(officerInvitations.revokedAt), isNull(officerInvitations.memberId)))
    .orderBy(asc(officerInvitations.createdAt));
}

/**
 * Create an invitation and return its one-time link token. Only the token's hash is stored,
 * so the link can be shown once and never again. An earlier open invitation for the same
 * email is revoked, so only the newest link works.
 */
export async function inviteOfficer(
  tx: Tx,
  actor: Actor,
  input: { email: string; roles: readonly string[] },
  now = new Date(),
): Promise<{ invitationId: string; token: string; expiresAt: Date; needsApproval: boolean }> {
  requireManager(actor);
  const email = normaliseEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OfficerError("Enter a valid email address.");
  const roles = officerRoles(input.roles);

  const [existing] = await tx
    .select({ userId: users.id })
    .from(societyUsers)
    .innerJoin(users, eq(users.id, societyUsers.userId))
    .where(and(eq(societyUsers.societyId, actor.societyId), eq(users.email, email)));
  if (existing) throw new OfficerError(`${email} is already an officer of this society. Change their roles instead.`);

  const open = await tx
    .select({ id: officerInvitations.id })
    .from(officerInvitations)
    .where(and(eq(officerInvitations.email, email), isNull(officerInvitations.acceptedAt), isNull(officerInvitations.revokedAt)));
  for (const { id } of open) await closeInvitation(tx, actor, id, "officer.invitation_replaced", now);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  // A role that approves or manages others needs a second officer's approval, unless the
  // society has no one else who could give it yet (its first officers).
  const sensitive = isSensitiveGrant(roles);
  const needsApproval = sensitive && (await otherApproverExists(tx, actor.societyId, [actor.userId]));
  const [row] = await tx
    .insert(officerInvitations)
    .values({ societyId: actor.societyId, email, roles, tokenHash: hashToken(token), invitedBy: actor.userId, createdAt: now, expiresAt, needsApproval })
    .returning({ id: officerInvitations.id });
  if (needsApproval) {
    await tx.insert(roleGrantRequests).values({ societyId: actor.societyId, invitationId: row!.id, roles, requestedBy: actor.userId });
  }
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "officer.invited",
    entityType: "officer_invitation",
    entityId: row!.id,
    after: { email, roles, expiresAt: expiresAt.toISOString(), needsApproval, ...(sensitive && !needsApproval ? { grantedWithoutSecondOfficer: true } : {}) },
  });
  return { invitationId: row!.id, token, expiresAt, needsApproval };
}

/**
 * Invite a member to the member portal. The new account is tied to that member record and can
 * only see that member's own balances, statements and loans.
 */
export async function inviteMember(tx: Tx, actor: Actor, memberId: string, rawEmail: string, now = new Date()): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
  if (!can(actor.roles, "members.write") && !can(actor.roles, "officers.manage")) throw new PermissionError("Your role cannot invite members to the portal");
  const email = normaliseEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OfficerError("Enter the member's email address.");
  const [member] = await tx.select().from(members).where(and(eq(members.societyId, actor.societyId), eq(members.id, memberId)));
  if (!member || member.status !== "active") throw new OfficerError("Only active members can be invited to the portal.");
  const [linked] = await tx.select().from(societyUsers).where(and(eq(societyUsers.societyId, actor.societyId), eq(societyUsers.memberId, memberId)));
  if (linked) throw new OfficerError("This member already has portal access.");
  const open = await tx
    .select({ id: officerInvitations.id })
    .from(officerInvitations)
    .where(and(eq(officerInvitations.memberId, memberId), isNull(officerInvitations.acceptedAt), isNull(officerInvitations.revokedAt)));
  for (const { id } of open) await closeInvitation(tx, actor, id, "officer.invitation_replaced", now);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await tx
    .insert(officerInvitations)
    .values({ societyId: actor.societyId, email, roles: ["member"], memberId, tokenHash: hashToken(token), invitedBy: actor.userId, createdAt: now, expiresAt })
    .returning({ id: officerInvitations.id });
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "member.portal_invited",
    entityType: "member",
    entityId: memberId,
    after: { email, invitationId: row!.id, expiresAt: expiresAt.toISOString() },
  });
  return { invitationId: row!.id, token, expiresAt };
}

/** Whether a member already uses the portal, and any open invitation. */
export async function memberPortalStatus(tx: Tx, actor: Actor, memberId: string) {
  const [linked] = await tx
    .select({ email: users.email })
    .from(societyUsers)
    .innerJoin(users, eq(users.id, societyUsers.userId))
    .where(and(eq(societyUsers.societyId, actor.societyId), eq(societyUsers.memberId, memberId)));
  const [invite] = await tx
    .select({ email: officerInvitations.email, expiresAt: officerInvitations.expiresAt })
    .from(officerInvitations)
    .where(and(eq(officerInvitations.memberId, memberId), isNull(officerInvitations.acceptedAt), isNull(officerInvitations.revokedAt)));
  return { email: linked?.email ?? null, invited: invite ? { email: invite.email, expiresAt: invite.expiresAt } : null };
}

export async function revokeInvitation(tx: Tx, actor: Actor, invitationId: string): Promise<void> {
  requireManager(actor);
  await closeInvitation(tx, actor, invitationId, "officer.invitation_revoked");
}

async function closeInvitation(tx: Tx, actor: Actor, invitationId: string, action: string, now = new Date()) {
  const [row] = await tx
    .update(officerInvitations)
    .set({ revokedAt: now, revokedBy: actor.userId })
    .where(and(eq(officerInvitations.id, invitationId), isNull(officerInvitations.acceptedAt), isNull(officerInvitations.revokedAt)))
    .returning({ email: officerInvitations.email });
  if (!row) throw new OfficerError("That invitation was already used or withdrawn.");
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action,
    entityType: "officer_invitation",
    entityId: invitationId,
    before: { email: row.email },
  });
}

export type InvitationLookup =
  | { status: "valid"; id: string; societyId: string; societyName: string; email: string; roles: Role[]; expiresAt: Date; memberId: string | null }
  | { status: "expired" | "used" | "revoked" | "not_found" | "awaiting_approval" };

/** Look up an invitation by the token in its link, before any society is in scope. */
export async function findInvitation(db: Database | Tx, token: string, now = new Date()): Promise<InvitationLookup> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { status: "not_found" };
  const [row] = await db.execute<{
    id: string;
    society_id: string;
    society_name: string;
    email: string;
    roles: string[];
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    member_id: string | null;
    needs_approval: boolean;
  }>(sql`select * from invitation_for_token(${hashToken(token)})`);
  if (!row) return { status: "not_found" };
  if (row.accepted_at) return { status: "used" };
  if (row.revoked_at) return { status: "revoked" };
  if (row.needs_approval) return { status: "awaiting_approval" };
  const expiresAt = new Date(row.expires_at);
  if (expiresAt <= now) return { status: "expired" };
  return {
    status: "valid",
    id: row.id,
    societyId: row.society_id,
    societyName: row.society_name,
    email: row.email,
    roles: row.roles.filter((r): r is Role => KNOWN.has(r) || r === "member"),
    expiresAt,
    memberId: row.member_id,
  };
}

/**
 * Accept an invitation as `user`, inside a transaction scoped to the invitation's society.
 * The user's email must be the invited one. Roles are added to any the user already holds.
 */
export async function acceptInvitation(
  tx: Tx,
  invitationId: string,
  user: { id: string; email: string },
  now = new Date(),
): Promise<{ societyId: string; roles: Role[] }> {
  const [inv] = await tx.select().from(officerInvitations).where(eq(officerInvitations.id, invitationId)).for("update");
  if (!inv || inv.acceptedAt || inv.revokedAt) throw new OfficerError("This invitation was already used or withdrawn.");
  if (inv.needsApproval) throw new OfficerError("This invitation is waiting for a second officer's approval.");
  if (inv.expiresAt <= now) throw new OfficerError("This invitation has expired. Ask for a new one.");
  if (normaliseEmail(user.email) !== inv.email) throw new OfficerError(`This invitation is for ${inv.email}.`);

  const [current] = await tx
    .select()
    .from(societyUsers)
    .where(and(eq(societyUsers.societyId, inv.societyId), eq(societyUsers.userId, user.id)));
  if (inv.memberId && current?.memberId && current.memberId !== inv.memberId) throw new OfficerError("This account is already linked to a different member.");
  const roles = sortRoles([...(current?.roles ?? []), ...inv.roles]);
  const memberId = inv.memberId ?? current?.memberId ?? null;
  await tx
    .insert(societyUsers)
    .values({ societyId: inv.societyId, userId: user.id, roles, memberId })
    .onConflictDoUpdate({ target: [societyUsers.societyId, societyUsers.userId], set: { roles, memberId } });
  await tx.update(officerInvitations).set({ acceptedAt: now, acceptedBy: user.id }).where(eq(officerInvitations.id, invitationId));
  await recordAudit(tx, {
    societyId: inv.societyId,
    actorId: user.id,
    action: "officer.joined",
    entityType: "society_user",
    entityId: user.id,
    before: current ? { roles: current.roles } : undefined,
    after: { email: inv.email, roles, invitationId, memberId },
  });
  return { societyId: inv.societyId, roles };
}

export async function changeOfficerRoles(tx: Tx, actor: Actor, userId: string, newRoles: readonly string[], reason: string): Promise<{ pending: boolean }> {
  requireManager(actor);
  if (userId === actor.userId) throw new OfficerError("You can't change your own roles. Ask another officer who manages officers.");
  if (!reason.trim()) throw new OfficerError("Give a reason for the change.");
  const member = and(eq(societyUsers.societyId, actor.societyId), eq(societyUsers.userId, userId));
  const [current] = await tx.select().from(societyUsers).where(member).for("update");
  if (!current) throw new OfficerError("That person is not an officer of this society.");
  // Officer roles change; member-portal access, if any, is kept.
  const roles = sortRoles([...officerRoles(newRoles), ...(current.roles.includes("member") ? ["member"] : [])]);
  if (isSensitiveGrant(roles, current.roles as Role[]) && (await otherApproverExists(tx, actor.societyId, [actor.userId, userId]))) {
    await tx.insert(roleGrantRequests).values({ societyId: actor.societyId, userId, roles, reason, requestedBy: actor.userId });
    await recordAudit(tx, {
      societyId: actor.societyId,
      actorId: actor.userId,
      action: "officer.roles_change_requested",
      entityType: "society_user",
      entityId: userId,
      before: { roles: current.roles },
      after: { roles },
      reason,
    });
    return { pending: true };
  }
  await tx.update(societyUsers).set({ roles }).where(member);
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "officer.roles_changed",
    entityType: "society_user",
    entityId: userId,
    before: { roles: current.roles },
    after: { roles },
    reason,
  });
  return { pending: false };
}

/** Remove someone's access to the society. Their past work stays attributed to them. */
export async function removeOfficer(tx: Tx, actor: Actor, userId: string, reason: string): Promise<void> {
  requireManager(actor);
  if (userId === actor.userId) throw new OfficerError("You can't remove yourself. Ask another officer who manages officers.");
  if (!reason.trim()) throw new OfficerError("Give a reason for removing access.");
  const where = and(eq(societyUsers.societyId, actor.societyId), eq(societyUsers.userId, userId));
  const [removed] = await tx.select().from(societyUsers).where(where).for("update");
  if (!removed) throw new OfficerError("That person is not an officer of this society.");
  // Someone who is also a member keeps their member-portal access.
  if (removed.roles.includes("member")) await tx.update(societyUsers).set({ roles: ["member"] }).where(where);
  else await tx.delete(societyUsers).where(where);
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "officer.removed",
    entityType: "society_user",
    entityId: userId,
    before: { roles: removed.roles },
    reason,
  });
}

export interface RoleGrantView {
  id: string;
  kind: "invitation" | "change";
  who: string;
  roles: string[];
  reason: string | null;
  requestedBy: string;
  requestedByName: string;
  requestedAt: Date;
  targetUserId: string | null;
}

/** Sensitive role grants waiting for a second officer. */
export async function listRoleGrantRequests(tx: Tx, actor: Actor): Promise<RoleGrantView[]> {
  if (!canApproveRoleGrant(actor.roles)) throw new PermissionError("Your role cannot see role requests");
  const rows = await tx.execute<{
    id: string;
    invitation_id: string | null;
    user_id: string | null;
    roles: string[];
    reason: string | null;
    requested_by: string;
    requested_by_name: string;
    requested_at: string;
    invite_email: string | null;
    user_name: string | null;
  }>(sql`
    select g.id, g.invitation_id, g.user_id, g.roles, g.reason, g.requested_by, r.name as requested_by_name, g.requested_at,
           i.email as invite_email, u.name as user_name
    from role_grant_requests g
    join users r on r.id = g.requested_by
    left join officer_invitations i on i.id = g.invitation_id
    left join users u on u.id = g.user_id
    where g.society_id = ${actor.societyId} and g.status = 'pending'
      -- A withdrawn invitation, or an officer since removed, has nothing left to approve.
      and (g.invitation_id is null or (i.accepted_at is null and i.revoked_at is null))
      and (g.user_id is null or exists (select 1 from society_users s where s.society_id = g.society_id and s.user_id = g.user_id))
    order by g.requested_at
  `);
  return rows.map((r) => ({
    id: r.id,
    kind: r.invitation_id ? "invitation" : "change",
    who: r.invite_email ?? r.user_name ?? "",
    roles: r.roles,
    reason: r.reason,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    requestedAt: new Date(r.requested_at),
    targetUserId: r.user_id,
  }));
}

/**
 * A second officer approves or rejects a sensitive role grant. They must manage officers or approve
 * settings, and can't be the person who asked or the person receiving the role.
 */
export async function decideRoleGrant(tx: Tx, actor: Actor & { email?: string }, requestId: string, decision: "approve" | "reject", reason = ""): Promise<void> {
  if (!canApproveRoleGrant(actor.roles)) throw new PermissionError("Your role cannot approve role changes");
  const [g] = await tx.select().from(roleGrantRequests).where(and(eq(roleGrantRequests.id, requestId), eq(roleGrantRequests.societyId, actor.societyId))).for("update");
  if (!g || g.status !== "pending") throw new OfficerError("That request was already decided.");
  if (g.requestedBy === actor.userId) throw new PermissionError("The person who asked for this role can't also approve it");
  if (g.userId === actor.userId) throw new PermissionError("You can't approve a role for yourself");
  let invitation: typeof officerInvitations.$inferSelect | undefined;
  if (g.invitationId) {
    [invitation] = await tx.select().from(officerInvitations).where(eq(officerInvitations.id, g.invitationId)).for("update");
    if (actor.email && invitation && normaliseEmail(actor.email) === invitation.email) throw new PermissionError("You can't approve a role for yourself");
  }
  await tx
    .update(roleGrantRequests)
    .set({ status: decision === "approve" ? "approved" : "rejected", decidedBy: actor.userId, decidedAt: new Date(), decisionReason: reason.trim() || null })
    .where(eq(roleGrantRequests.id, requestId));
  if (decision === "approve") {
    if (invitation) {
      if (invitation.acceptedAt || invitation.revokedAt) throw new OfficerError("That invitation was withdrawn.");
      await tx.update(officerInvitations).set({ needsApproval: false }).where(eq(officerInvitations.id, invitation.id));
    } else if (g.userId) {
      const where = and(eq(societyUsers.societyId, actor.societyId), eq(societyUsers.userId, g.userId));
      const [current] = await tx.select().from(societyUsers).where(where).for("update");
      if (!current) throw new OfficerError("That person is no longer an officer of this society.");
      await tx.update(societyUsers).set({ roles: sortRoles([...g.roles.filter((r) => r !== "member"), ...(current.roles.includes("member") ? ["member"] : [])]) }).where(where);
    }
  } else if (invitation && !invitation.acceptedAt && !invitation.revokedAt) {
    await tx.update(officerInvitations).set({ revokedAt: new Date(), revokedBy: actor.userId }).where(eq(officerInvitations.id, invitation.id));
  }
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: decision === "approve" ? "officer.role_grant_approved" : "officer.role_grant_rejected",
    entityType: "role_grant_request",
    entityId: requestId,
    after: { roles: g.roles, ...(invitation ? { email: invitation.email } : { userId: g.userId }) },
    ...(reason.trim() ? { reason } : {}),
  });
}
