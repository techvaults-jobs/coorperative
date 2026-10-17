import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requireViewer, requiresTwoFactor } from "@/lib/session";
import { TwoFactorSetup } from "./two-factor-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const viewer = await requireViewer();
  const { required } = await searchParams;
  const officer = viewer.societies.some((s) => requiresTwoFactor(s.roles));

  return (
    <AuthShell title="Security" description={<>Signed in as {viewer.user.email}</>}>
      {required && !viewer.user.twoFactorEnabled && (
        <Alert tone="warning">Your role handles member money and records, so two-factor authentication must be on before you can continue.</Alert>
      )}
      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 font-medium">
            <ShieldCheck className="text-accent size-4" aria-hidden />
            Two-factor authentication
          </h2>
          {viewer.user.twoFactorEnabled ? (
            <Badge tone="good" dot>
              On
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Off
            </Badge>
          )}
        </div>
        <p className="text-muted text-sm">
          After your password, you&apos;ll enter a 6-digit code from an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
        <TwoFactorSetup enabled={viewer.user.twoFactorEnabled} officer={officer} />
      </section>
      {viewer.societies.length > 0 && (!required || viewer.user.twoFactorEnabled) && (
        <Link href="/overview" className="text-accent inline-flex items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Back to your society
        </Link>
      )}
    </AuthShell>
  );
}
