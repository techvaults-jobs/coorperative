import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireViewer, requiresTwoFactor } from "@/lib/session";
import { TwoFactorSetup } from "./two-factor-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security · TechVaults Cooperative" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const viewer = await requireViewer();
  const { required } = await searchParams;
  const officer = viewer.societies.some((s) => requiresTwoFactor(s.roles));

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-muted text-sm">Signed in as {viewer.user.email}</p>
      </div>
      {required && !viewer.user.twoFactorEnabled && (
        <p role="alert" className="bg-warning-soft text-warning rounded-md px-4 py-3 text-sm">
          Your role handles member money and records, so two-factor authentication must be on before you can continue.
        </p>
      )}
      <section className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium">Two-factor authentication</h2>
          {viewer.user.twoFactorEnabled ? <Badge tone="good">On</Badge> : <Badge tone="warning">Off</Badge>}
        </div>
        <p className="text-muted text-sm">
          After your password, you&apos;ll enter a 6-digit code from an authenticator app such as Google Authenticator, Microsoft
          Authenticator or 1Password.
        </p>
        <TwoFactorSetup enabled={viewer.user.twoFactorEnabled} officer={officer} />
      </section>
      {viewer.user.twoFactorEnabled && viewer.societies.length > 0 && (
        <Link href="/overview" className="text-accent text-sm underline-offset-2 hover:underline">
          Continue to your society →
        </Link>
      )}
    </main>
  );
}
