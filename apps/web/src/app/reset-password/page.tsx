import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { buttonClass } from "@/components/ui/button";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (!token || error) {
    return (
      <AuthShell title="This link has expired" description="Reset links work once, for one hour. Ask for a new one.">
        <Link href="/forgot-password" className={buttonClass("primary", "w-fit")}>
          Send a new link
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" description="At least 12 characters. You'll be signed out everywhere else.">
      <ResetForm token={token} />
    </AuthShell>
  );
}
