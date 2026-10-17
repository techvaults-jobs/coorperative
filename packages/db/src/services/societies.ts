import { ROLES, type Role } from "@techvaults/core";
import { sql } from "drizzle-orm";
import type { Database } from "../client.js";

export interface SocietyMembership {
  societyId: string;
  societyName: string;
  societySlug: string;
  roles: Role[];
}

const KNOWN_ROLES = new Set<string>(ROLES);

/** Societies a user belongs to, with their roles. Unknown role names are dropped, never trusted. */
export async function listUserSocieties(db: Database, userId: string): Promise<SocietyMembership[]> {
  const rows = await db.execute<{ society_id: string; society_name: string; society_slug: string; roles: string[] }>(
    sql`select * from user_societies(${userId}::uuid)`,
  );
  return rows.map((r) => ({
    societyId: r.society_id,
    societyName: r.society_name,
    societySlug: r.society_slug,
    roles: r.roles.filter((role): role is Role => KNOWN_ROLES.has(role)),
  }));
}
