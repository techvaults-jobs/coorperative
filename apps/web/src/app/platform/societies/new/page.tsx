import { SECTOR_PROFILES, SECTORS } from "@techvaults/core";
import { PageHeader } from "@/components/ui/page-header";
import { requirePlatformStaff } from "@/lib/session";
import { OnboardForm } from "./onboard-form";

export const metadata = { title: "Onboard a society · Staff console" };

export default async function OnboardPage() {
  await requirePlatformStaff();
  return (
    <>
      <PageHeader
        back={{ href: "/platform", label: "Societies" }}
        title="Onboard a society"
        description="Creates the society with a starter chart of accounts for its sector and invites its secretary, who then sets everything else up and invites the other officers."
      />
      <OnboardForm sectors={SECTORS.map((s) => ({ value: s, label: SECTOR_PROFILES[s].label, description: SECTOR_PROFILES[s].description }))} />
    </>
  );
}
