import "server-only";
import { can, type Permission, type Role } from "@techvaults/core";
import { eq, listUserSocieties, schema, withSociety, type Actor, type SocietyMembership, type Tx } from "@techvaults/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";

export const SOCIETY_COOKIE = "tv_society";

export interface Viewer {
  user: { id: string; name: string; email: string; twoFactorEnabled: boolean };
  societies: SocietyMembership[];
}

export interface Workspace extends Viewer {
  society: SocietyMembership;
  actor: Actor;
}

/** Signed-in person and their societies, or a redirect to sign-in. Cached per request. */
export const requireViewer = cache(async (): Promise<Viewer> => {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const user = session.user;
  // Read the two-factor flag from the database, not the session payload, which can lag behind.
  const [row] = await db().select({ twoFactorEnabled: schema.users.twoFactorEnabled }).from(schema.users).where(eq(schema.users.id, user.id));
  return {
    user: { id: user.id, name: user.name, email: user.email, twoFactorEnabled: !!row?.twoFactorEnabled },
    societies: await listUserSocieties(db(), user.id),
  };
});

/**
 * The society the person is working in, chosen by cookie, and the actor used for every
 * service call. Officers with financial roles must have two-factor authentication on.
 */
export const requireWorkspace = cache(async (): Promise<Workspace> => {
  const viewer = await requireViewer();
  if (viewer.societies.length === 0) redirect("/no-society");
  const chosen = (await cookies()).get(SOCIETY_COOKIE)?.value;
  const society = viewer.societies.find((s) => s.societyId === chosen) ?? viewer.societies[0]!;
  if (requiresTwoFactor(society.roles) && !viewer.user.twoFactorEnabled && process.env.REQUIRE_TWO_FACTOR !== "false") {
    redirect("/security?required=1");
  }
  return { ...viewer, society, actor: { userId: viewer.user.id, societyId: society.societyId, roles: society.roles } };
});

const OFFICER_ROLES: readonly Role[] = ["principal_officer", "chairperson", "secretary", "treasurer", "loan_officer", "loan_committee", "payroll_officer", "auditor"];

export function requiresTwoFactor(roles: readonly Role[]): boolean {
  return roles.some((r) => OFFICER_ROLES.includes(r));
}

/** Run a database call scoped to the workspace's society. */
export async function inSociety<T>(workspace: Workspace, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withSociety(db(), workspace.society.societyId, fn);
}

export function hasPermission(workspace: Workspace, permission: Permission): boolean {
  return can(workspace.actor.roles, permission);
}
