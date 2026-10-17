import { BRAND_PRESETS } from "@techvaults/core";
import { hasPermission, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";
import { BrandingEditor } from "./branding-editor";

export const metadata = { title: "Branding" };

export default async function BrandingPage() {
  const ws = await requireWorkspace();
  const s = await requireSociety();
  return <BrandingEditor current={s.brandColor} presets={[...BRAND_PRESETS]} name={s.shortName || s.name} canEdit={hasPermission(ws, "settings.manage")} />;
}
