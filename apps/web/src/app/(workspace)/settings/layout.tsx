import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, requireWorkspace } from "@/lib/session";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "settings.manage") && !hasPermission(ws, "accounts.manage")) {
    return <EmptyState title="Your role doesn't include society settings." />;
  }
  return (
    <>
      <PageHeader title="Settings" description="How this society is set up in Cooperative Vaults. Every change is recorded in the audit trail." />
      <div className="flex flex-col gap-6">
        <SettingsTabs />
        {children}
      </div>
    </>
  );
}
