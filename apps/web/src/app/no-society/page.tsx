import { requireViewer } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function NoSocietyPage() {
  const viewer = await requireViewer();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold tracking-tight">No society linked yet</h1>
      <p className="text-muted text-sm">
        You&apos;re signed in as {viewer.user.email}, but no cooperative society has given this account a role. Ask your society&apos;s
        secretary to add you.
      </p>
      <SignOutButton />
    </main>
  );
}
