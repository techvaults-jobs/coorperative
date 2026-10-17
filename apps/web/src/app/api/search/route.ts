import { listMembers } from "@techvaults/db";
import { NextResponse } from "next/server";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";

/** Member lookup for the command palette. Scoped to the signed-in officer's society and role. */
export async function GET(request: Request) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "members.read")) return NextResponse.json({ members: [] }, { status: 403 });
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  if (q.length < 2) return NextResponse.json({ members: [] });
  const rows = await inSociety(ws, (tx) => listMembers(tx, ws.actor, { search: q }));
  return NextResponse.json({
    members: rows.slice(0, 8).map((m) => ({
      id: m.id,
      label: m.fullName,
      hint: [m.memberNo, m.staffId, m.department].filter(Boolean).join(" · "),
      href: `/members/${m.id}`,
      kind: "member",
    })),
  });
}
