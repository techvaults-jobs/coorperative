import { PERMISSIONS } from "@techvaults/core";
import { listSubmissions } from "@techvaults/db";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { Sidebar } from "./sidebar";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const ws = await requireWorkspace();
  const permissions = PERMISSIONS.filter((p) => hasPermission(ws, p));
  const approvals = hasPermission(ws, "ledger.approve") || hasPermission(ws, "ledger.prepare");
  const pending = approvals ? (await inSociety(ws, (tx) => listSubmissions(tx, ws.actor, { status: "pending" }))).length : 0;
  return (
    <div className="flex min-h-[calc(100vh-2.25rem)] flex-col md:flex-row">
      <Sidebar
        user={{ name: ws.user.name, email: ws.user.email }}
        current={{ id: ws.society.societyId, name: ws.society.societyName, roles: ws.society.roles }}
        societies={ws.societies.map((s) => ({ id: s.societyId, name: s.societyName }))}
        permissions={permissions}
        pendingApprovals={pending}
      />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}
