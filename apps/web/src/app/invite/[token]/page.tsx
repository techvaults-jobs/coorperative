import { eq, findInvitation, schema } from "@techvaults/db";
import { headers } from "next/headers";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { buttonClass } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/roles";
import { AcceptForm } from "./accept-form";

export const dynamic = "force-dynamic";
// The token is in the path, so never send it onward in a Referer header.
export const metadata = { title: "Accept invitation · TechVaults Cooperative", referrer: "no-referrer" as const };

const CLOSED = {
  expired: "This invitation has expired. Ask your society's secretary for a new link.",
  used: "This invitation has already been used. If it was you, sign in with the account you created.",
  revoked: "This invitation was withdrawn. Ask your society's secretary for a new link if you still need access.",
  not_found: "This link isn't valid. Check you copied all of it, or ask for a new one.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvitation(db(), token);

  if (invite.status !== "valid") {
    return (
      <Shell title="Invitation unavailable">
        <p className="text-muted text-sm">{CLOSED[invite.status]}</p>
        <Link href="/sign-in" className={buttonClass("secondary", "w-fit")}>
          Go to sign in
        </Link>
      </Shell>
    );
  }

  const session = await auth().api.getSession({ headers: await headers() });
  const [existing] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, invite.email));
  const summary = (
    <p className="text-muted text-sm">
      You&apos;ve been invited to <strong className="text-foreground">{invite.societyName}</strong> as{" "}
      {invite.roles.map(roleLabel).join(", ")}. The invitation is for <strong className="text-foreground break-all">{invite.email}</strong>.
    </p>
  );

  if (session && session.user.email.toLowerCase() !== invite.email) {
    return (
      <Shell title="Wrong account">
        {summary}
        <p className="text-sm">
          You&apos;re signed in as <span className="break-all">{session.user.email}</span>. Sign out, then open this link again.
        </p>
        <SignOutButton redirectTo={`/invite/${token}`} />
      </Shell>
    );
  }
  if (session) {
    return (
      <Shell title="Join this society">
        {summary}
        <AcceptForm token={token} mode="existing" />
      </Shell>
    );
  }
  if (existing) {
    return (
      <Shell title="Sign in to accept">
        {summary}
        <p className="text-sm">You already have an account with this email. Sign in, then open this link again to join.</p>
        <Link href="/sign-in" className={buttonClass("primary", "w-fit")}>
          Sign in
        </Link>
      </Shell>
    );
  }
  return (
    <Shell title="Set up your account">
      {summary}
      <AcceptForm token={token} mode="new" email={invite.email} />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <p className="text-muted font-mono text-xs tracking-widest uppercase">TechVaults Cooperative</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </main>
  );
}
