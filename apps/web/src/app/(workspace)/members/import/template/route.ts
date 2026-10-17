import { MEMBER_COLUMNS, toCsv } from "@techvaults/core";
import { listChartOfAccounts } from "@techvaults/db";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

/** Blank import templates headed in the society's own words and account codes. */
export async function GET(request: Request) {
  const ws = await requireWorkspace();
  const kind = new URL(request.url).searchParams.get("kind");
  const society = await requireSociety();
  let rows: string[][];
  if (kind === "balances") {
    if (!hasPermission(ws, "ledger.prepare")) return new Response("Forbidden", { status: 403 });
    const accounts = (await inSociety(ws, (tx) => listChartOfAccounts(tx, ws.actor))).filter((a) => a.isMemberControl && a.class !== "asset" && a.isActive);
    rows = [["Member no", ...accounts.map((a) => `${a.code} ${a.name}`)], ["M-0001", ...accounts.map(() => "0.00")]];
  } else {
    if (!hasPermission(ws, "members.write")) return new Response("Forbidden", { status: 403 });
    const t = society.terminology;
    rows = [
      MEMBER_COLUMNS.map((c) => (c === "External ID" ? t.externalId : c === "Group" ? t.group : c)),
      ["M-0001", "Adaeze Okonkwo", "DS/1001", "Bursary", "08030000000", "adaeze@example.ng", "05/01/2024", "active"],
    ];
  }
  return new Response("﻿" + toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind === "balances" ? "opening-balances" : "members"}-template.csv"` },
  });
}
