import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · TechVaults Cooperative" };

export default async function SignInPage() {
  const session = await auth().api.getSession({ headers: await headers() });
  if (session) redirect("/overview");
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <p className="text-muted font-mono text-xs uppercase tracking-widest">TechVaults Cooperative</p>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted text-sm">Use the email your society registered for you. Accounts are created by your society&apos;s secretary.</p>
      </div>
      <SignInForm />
    </main>
  );
}
