import { MODULE_LABELS, MODULES, SECTOR_PROFILES, SECTORS } from "@techvaults/core";
import { hasPermission, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";
import { SectorEditor } from "./sector-editor";

export const metadata = { title: "Sector & modules" };

export default async function SectorPage() {
  const ws = await requireWorkspace();
  const s = await requireSociety();
  return (
    <SectorEditor
      canEdit={hasPermission(ws, "settings.manage")}
      sector={s.sector}
      overrides={s.terminologyOverrides}
      modules={s.modules}
      customised={s.modulesCustomised}
      sectors={SECTORS.map((k) => ({ key: k, ...SECTOR_PROFILES[k] }))}
      moduleOptions={MODULES.map((m) => ({ key: m, ...MODULE_LABELS[m] }))}
    />
  );
}
