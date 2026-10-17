import { PERMISSIONS } from "@techvaults/core";
import { listSubmissions } from "@techvaults/db";
import { SidebarContent } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { SECTOR_PROFILES } from "@techvaults/core";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";
import { savedTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const ws = await requireWorkspace();
  const society = await requireSociety();
  const permissions = PERMISSIONS.filter((p) => hasPermission(ws, p));
  const approvals = hasPermission(ws, "ledger.approve") || hasPermission(ws, "ledger.prepare");
  const pendingApprovals = approvals ? (await inSociety(ws, (tx) => listSubmissions(tx, ws.actor, { status: "pending" }))).length : 0;
  const shell = {
    user: { name: ws.user.name, email: ws.user.email },
    current: { id: ws.society.societyId, name: society.shortName || society.name, roles: ws.society.roles, sector: SECTOR_PROFILES[society.sector].label },
    societies: ws.societies.map((s) => ({ id: s.societyId, name: s.societyName })),
    permissions,
    modules: society.modules,
    pendingApprovals,
  };
  return (
    <div
      className={society.brandColor ? "branded flex min-h-screen" : "flex min-h-screen"}
      style={society.brandColor ? ({ "--brand": society.brandColor } as React.CSSProperties) : undefined}
    >
      <aside data-print-hide className="bg-sidebar sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <SidebarContent {...shell} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar {...shell} theme={await savedTheme()} />
        <main className="flex-1 px-4 py-8 sm:px-8">
          <div className="animate-in mx-auto flex max-w-7xl flex-col gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
