/**
 * The TechVaults platform console: onboarding societies. Staff see each society's size and
 * activity, never members' financial records (D-012).
 */
import { checkBrandColor, SECTORS, slugify, starterChart, type Sector } from "@techvaults/core";
import { eq, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { withSociety, type Database } from "../client.js";
import { ledgerAccounts, officerInvitations, societies, users } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError } from "./ledger.js";
import { hashToken, INVITATION_DAYS, normaliseEmail } from "./officers.js";
import { SettingsError } from "./settings.js";

export async function isPlatformStaff(db: Database, userId: string): Promise<boolean> {
  const [u] = await db.select({ staff: users.isPlatformStaff }).from(users).where(eq(users.id, userId));
  return !!u?.staff;
}

async function requireStaff(db: Database, userId: string) {
  if (!(await isPlatformStaff(db, userId))) throw new PermissionError("TechVaults platform staff only");
}

export interface PlatformSociety {
  id: string;
  name: string;
  shortName: string | null;
  slug: string;
  state: string;
  sector: Sector;
  createdAt: Date;
  members: number;
  officers: number;
  lastActivity: Date | null;
}

export async function listPlatformSocieties(db: Database, userId: string): Promise<PlatformSociety[]> {
  await requireStaff(db, userId);
  const rows = await db.execute<{
    id: string;
    name: string;
    short_name: string | null;
    slug: string;
    state: string;
    sector: Sector;
    created_at: string;
    members: string;
    officers: string;
    last_activity: string | null;
  }>(sql`select * from platform_societies(${userId}::uuid)`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    slug: r.slug,
    state: r.state,
    sector: r.sector,
    createdAt: new Date(r.created_at),
    members: Number(r.members),
    officers: Number(r.officers),
    lastActivity: r.last_activity ? new Date(r.last_activity) : null,
  }));
}

export interface NewSociety {
  name: string;
  shortName?: string;
  state: string;
  registrar: string;
  registrationNumber?: string;
  sector: string;
  brandColor?: string;
  secretaryEmail: string;
}

/**
 * Create a society with a starter chart of accounts for its sector, and an invitation for its
 * first secretary (who can then invite the other officers). Returns the invitation token.
 */
export async function createSociety(db: Database, staffUserId: string, input: NewSociety): Promise<{ societyId: string; token: string; expiresAt: Date }> {
  await requireStaff(db, staffUserId);
  const name = input.name.trim();
  if (name.length < 5) throw new SettingsError("Enter the society's registered name.");
  if (!(SECTORS as readonly string[]).includes(input.sector)) throw new SettingsError("Choose the society's sector.");
  if (!input.state.trim()) throw new SettingsError("Enter the state it's registered in.");
  if (!input.registrar.trim()) throw new SettingsError("Enter the registering Director of Co-operatives.");
  const email = normaliseEmail(input.secretaryEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SettingsError("Enter the secretary's email address.");
  let brandColor: string | null = null;
  if (input.brandColor?.trim()) {
    const check = checkBrandColor(input.brandColor);
    if (!check.ok) throw new SettingsError(check.reason);
    brandColor = check.color;
  }

  let slug = slugify(name);
  for (let i = 0; (await db.execute<{ taken: boolean }>(sql`select society_slug_taken(${slug}) as taken`))[0]!.taken; i++) {
    slug = `${slugify(name).slice(0, 42)}-${randomBytes(2).toString("hex")}`;
    if (i > 5) throw new SettingsError("Couldn't find a free short name; try a different society name.");
  }

  const societyId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  await withSociety(db, societyId, async (tx) => {
    await tx.insert(societies).values({
      id: societyId,
      name,
      shortName: input.shortName?.trim() || null,
      slug,
      state: input.state.trim(),
      registrar: input.registrar.trim(),
      registrationNumber: input.registrationNumber?.trim() || null,
      sector: input.sector as Sector,
      brandColor,
    });
    await tx.insert(ledgerAccounts).values(
      starterChart(input.sector as Sector).map((a) => ({ societyId, code: a.code, name: a.name, class: a.class, isMemberControl: a.memberControl })),
    );
    const [invite] = await tx
      .insert(officerInvitations)
      .values({ societyId, email, roles: ["secretary"], tokenHash: hashToken(token), invitedBy: staffUserId, expiresAt })
      .returning({ id: officerInvitations.id });
    await recordAudit(tx, {
      societyId,
      actorId: staffUserId,
      action: "society.created",
      entityType: "society",
      entityId: societyId,
      after: { name, slug, sector: input.sector, secretaryEmail: email, invitationId: invite!.id, by: "TechVaults platform staff" },
    });
  });
  return { societyId, token, expiresAt };
}
