"use server";

import { acceptInvitation, findInvitation, OfficerError, schema, withSociety } from "@techvaults/db";
import { hashPassword } from "better-auth/crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SOCIETY_COOKIE } from "@/lib/session";

/** `name` is echoed back so a validation error doesn't make the person retype it. */
export type AcceptState = { ok: boolean; message?: string; fieldErrors?: Record<string, string>; name?: string };

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "");

async function setSocietyCookie(societyId: string) {
  (await cookies()).set(SOCIETY_COOKIE, societyId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
}

function explain(error: unknown): string {
  if (error instanceof OfficerError) return error.message;
  if ((error as { cause?: { code?: string } })?.cause?.code === "23505") return "An account with this email already exists. Sign in, then open the link again.";
  console.error(error);
  return "Something went wrong and nothing was saved. Try again, or ask for a new invitation.";
}

/** Create an account for an invited officer, join the society, and sign them in. */
export async function acceptAsNewOfficer(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const token = field(formData, "token");
  const name = field(formData, "name").trim();
  const password = field(formData, "password");
  const fieldErrors: Record<string, string> = {};
  if (name.length < 3) fieldErrors.name = "Enter your full name as your society knows it.";
  if (password.length < 12) fieldErrors.password = "Use at least 12 characters.";
  else if (password.length > 128) fieldErrors.password = "Use at most 128 characters.";
  if (password !== field(formData, "confirm")) fieldErrors.confirm = "The two passwords don't match.";
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors, name };

  const invite = await findInvitation(db(), token);
  if (invite.status !== "valid") return { ok: false, message: "This invitation can no longer be used. Ask for a new one.", name };
  try {
    await withSociety(db(), invite.societyId, async (tx) => {
      const [user] = await tx.insert(schema.users).values({ email: invite.email, name }).returning({ id: schema.users.id });
      await tx.insert(schema.accounts).values({
        userId: user!.id,
        accountId: user!.id,
        providerId: "credential",
        password: await hashPassword(password),
      });
      await acceptInvitation(tx, invite.id, { id: user!.id, email: invite.email });
    });
  } catch (e) {
    return { ok: false, message: explain(e), name };
  }
  await auth().api.signInEmail({ body: { email: invite.email, password }, headers: await headers() });
  await setSocietyCookie(invite.societyId);
  // Members go to their portal; officers set up two-factor first.
  redirect(invite.roles.every((r) => r === "member") ? "/my" : "/security?required=1");
}

/** Join the society with the account the person is already signed in to. */
export async function acceptAsSignedInOfficer(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, message: "Sign in first, then open the link again." };
  const invite = await findInvitation(db(), field(formData, "token"));
  if (invite.status !== "valid") return { ok: false, message: "This invitation can no longer be used. Ask for a new one." };
  try {
    await withSociety(db(), invite.societyId, (tx) => acceptInvitation(tx, invite.id, { id: session.user.id, email: session.user.email }));
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  await setSocietyCookie(invite.societyId);
  redirect(invite.roles.every((r) => r === "member") ? "/my" : "/overview");
}
