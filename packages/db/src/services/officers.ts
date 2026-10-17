/**
 * Officers of a society and invitations for new ones. Societies add their own officers:
 * an officer with officers.manage creates an invitation link, which the invitee opens to
 * set a password (or, if they already have an account, to join with it).
 */
import { can, OFFICER_ROLES, type OfficerRole } from "@techvaults/core";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Database, Tx } from "../client.js";
import { officerInvitations, societyUsers, users } from "../schema.js";
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
    .where(eq(societyUsers.societyId, actor.societyId))
    .orderBy(asc(users.name));
}

export interface InvitationView {
  id: string;
  email: string;
  roles: string[];
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
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
    })
    .from(officerInvitations)
    .innerJoin(users, eq(users.id, officerInvitations.invitedBy))
    .where(and(isNull(officerInvitations.acceptedAt), isNull(officerInvitations.revokedAt)))
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
): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
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
  const [row] = await tx
    .insert(officerInvitations)
    .values({ societyId: actor.societyId, email, roles, tokenHash: hashToken(token), invitedBy: actor.userId, createdAt: now, expiresAt })
    .returning({ id: officerInvitations.id });
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "officer.invited",
    entityType: "officer_invitation",
    entityId: row!.id,
    after: { email, roles, expiresAt: expiresAt.toISOString() },
  });
  return { invitationId: row!.id, token, expiresAt };
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
  | { status: "valid"; id: string; societyId: string; societyName: string; email: string; roles: OfficerRole[]; expiresAt: Date }
  | { status: "expired" | "used" | "revoked" | "not_found" };

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
  }>(sql`select * from invitation_for_token(${hashToken(token)})`);
  if (!row) return { status: "not_found" };
  if (row.accepted_at) return { status: "used" };
  if (row.revoked_at) return { status: "revoked" };
  const expiresAt = new Date(row.expires_at);
  if (expiresAt <= now) return { status: "expired" };
  return {
    status: "valid",
    id: row.id,
    societyId: row.society_id,
    societyName: row.society_name,
    email: row.email,
    roles: row.roles.filter((r): r is OfficerRole => KNOWN.has(r)),
    expiresAt,
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
): Promise<{ societyId: string; roles: OfficerRole[] }> {
  const [inv] = await tx.select().from(officerInvitations).where(eq(officerInvitations.id, invitationId)).for("update");
  if (!inv || inv.acceptedAt || inv.revokedAt) throw new OfficerError("This invitation was already used or withdrawn.");
  if (inv.expiresAt <= now) throw new OfficerError("This invitation has expired. Ask for a new one.");
  if (normaliseEmail(user.email) !== inv.email) throw new OfficerError(`This invitation is for ${inv.email}.`);

  const [current] = await tx
    .select()
    .from(societyUsers)
    .where(and(eq(societyUsers.societyId, inv.societyId), eq(societyUsers.userId, user.id)));
  const roles = officerRoles([...(current?.roles.filter((r) => KNOWN.has(r)) ?? []), ...inv.roles]);
  await tx
    .insert(societyUsers)
    .values({ societyId: inv.societyId, userId: user.id, roles })
    .onConflictDoUpdate({ target: [societyUsers.societyId, societyUsers.userId], set: { roles } });
  await tx.update(officerInvitations).set({ acceptedAt: now, acceptedBy: user.id }).where(eq(officerInvitations.id, invitationId));
  await recordAudit(tx, {
    societyId: inv.societyId,
    actorId: user.id,
    action: "officer.joined",
    entityType: "society_user",
    entityId: user.id,
    before: current ? { roles: current.roles } : undefined,
    after: { email: inv.email, roles, invitationId },
  });
  return { societyId: inv.societyId, roles };
}

export async function changeOfficerRoles(tx: Tx, actor: Actor, userId: string, newRoles: readonly string[], reason: string): Promise<void> {
  requireManager(actor);
  if (userId === actor.userId) throw new OfficerError("You can't change your own roles. Ask another officer who manages officers.");
  if (!reason.trim()) throw new OfficerError("Give a reason for the change.");
  const roles = officerRoles(newRoles);
  const member = and(eq(societyUsers.societyId, actor.societyId), eq(societyUsers.userId, userId));
  const [current] = await tx.select().from(societyUsers).where(member).for("update");
  if (!current) throw new OfficerError("That person is not an officer of this society.");
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
}

/** Remove someone's access to the society. Their past work stays attributed to them. */
export async function removeOfficer(tx: Tx, actor: Actor, userId: string, reason: string): Promise<void> {
  requireManager(actor);
  if (userId === actor.userId) throw new OfficerError("You can't remove yourself. Ask another officer who manages officers.");
  if (!reason.trim()) throw new OfficerError("Give a reason for removing access.");
  const [removed] = await tx
    .delete(societyUsers)
    .where(and(eq(societyUsers.societyId, actor.societyId), eq(societyUsers.userId, userId)))
    .returning();
  if (!removed) throw new OfficerError("That person is not an officer of this society.");
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
