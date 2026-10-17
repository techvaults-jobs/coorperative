import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { auth } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  const session = await auth().api.getSession({ headers: await headers() });
  if (session) redirect("/overview");
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in with the email your society registered for you."
      footer="New officer? Your society's secretary sends you an invitation link. There's no public sign-up."
    >
      <SignInForm />
    </AuthShell>
  );
}
