import { AuthShell } from "@/components/auth-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { requireViewer } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "No society linked" };

export default async function NoSocietyPage() {
  const viewer = await requireViewer();
  return (
    <AuthShell
      title="No society linked yet"
      description={
        <>
          You&apos;re signed in as {viewer.user.email}, but no cooperative society has given this account a role. Ask your society&apos;s secretary to invite
          you.
        </>
      }
    >
      <SignOutButton />
    </AuthShell>
  );
}
