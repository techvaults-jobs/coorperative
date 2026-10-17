import "server-only";
import { can, OFFICER_ROLES, type Permission, type Role } from "@techvaults/core";
import { eq, listUserSocieties, schema, withSociety, type Actor, type SocietyMembership, type Tx } from "@techvaults/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";

export const SOCIETY_COOKIE = "tv_society";

export interface Viewer {
  user: { id: string; name: string; email: string; twoFactorEnabled: boolean; isPlatformStaff: boolean };
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
  const [row] = await db()
    .select({ twoFactorEnabled: schema.users.twoFactorEnabled, isPlatformStaff: schema.users.isPlatformStaff })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));
  return {
    user: { id: user.id, name: user.name, email: user.email, twoFactorEnabled: !!row?.twoFactorEnabled, isPlatformStaff: !!row?.isPlatformStaff },
    societies: await listUserSocieties(db(), user.id),
  };
});

/**
 * The society the person is working in, chosen by cookie, and the actor used for every
 * service call. Officers with financial roles must have two-factor authentication on.
 */
export const requireWorkspace = cache(async (): Promise<Workspace> => {
  const viewer = await requireViewer();
  if (viewer.societies.length === 0) redirect(viewer.user.isPlatformStaff ? "/platform" : "/no-society");
  const chosen = (await cookies()).get(SOCIETY_COOKIE)?.value;
  const society = viewer.societies.find((s) => s.societyId === chosen) ?? viewer.societies[0]!;
  // Members who aren't officers use the member portal, not the officers' workspace.
  if (!requiresTwoFactor(society.roles)) redirect(society.memberId ? "/my" : "/no-society");
  if (!viewer.user.twoFactorEnabled && process.env.REQUIRE_TWO_FACTOR !== "false") {
    redirect("/security?required=1");
  }
  return { ...viewer, society, actor: { userId: viewer.user.id, societyId: society.societyId, roles: society.roles, memberId: society.memberId } };
});

/**
 * The member portal: the signed-in person's own member record in the chosen society. Anyone
 * linked to a member record can use it, officers included.
 */
export const requirePortal = cache(async (): Promise<Workspace & { memberId: string }> => {
  const viewer = await requireViewer();
  const chosen = (await cookies()).get(SOCIETY_COOKIE)?.value;
  const withMember = viewer.societies.filter((s) => s.memberId && s.roles.includes("member"));
  if (withMember.length === 0) redirect(viewer.societies.length ? "/overview" : "/no-society");
  const society = withMember.find((s) => s.societyId === chosen) ?? withMember[0]!;
  const actor = { userId: viewer.user.id, societyId: society.societyId, roles: society.roles, memberId: society.memberId };
  return { ...viewer, society, actor, memberId: society.memberId! };
});

export function requiresTwoFactor(roles: readonly Role[]): boolean {
  return roles.some((r) => (OFFICER_ROLES as readonly Role[]).includes(r));
}

/** Run a database call scoped to the workspace's society. */
export async function inSociety<T>(workspace: Workspace, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withSociety(db(), workspace.society.societyId, fn);
}

export function hasPermission(workspace: Workspace, permission: Permission): boolean {
  return can(workspace.actor.roles, permission);
}

/** TechVaults platform staff, with two-factor on (unless switched off for the preview). */
export const requirePlatformStaff = cache(async (): Promise<Viewer> => {
  const viewer = await requireViewer();
  if (!viewer.user.isPlatformStaff) redirect("/overview");
  if (!viewer.user.twoFactorEnabled && process.env.REQUIRE_TWO_FACTOR !== "false") redirect("/security?required=1");
  return viewer;
});
