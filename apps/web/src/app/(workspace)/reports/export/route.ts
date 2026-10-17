import { toCsv } from "@techvaults/core";
import { financialPosition, incomeStatement, loanAging } from "@techvaults/db";
import { financialYearStart, todayIso, validDate } from "@/lib/periods";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

const naira = (k: bigint) => (Number(k) / 100).toFixed(2);

/** CSV versions of the reports, for accountants and auditors. */
export async function GET(request: Request) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read")) return new Response("Forbidden", { status: 403 });
  const society = await requireSociety();
  const q = new URL(request.url).searchParams;
  const report = q.get("report");
  let rows: (string | number)[][];
  let name: string;
  if (report === "position") {
    const asOf = validDate(q.get("asOf") ?? undefined, todayIso());
    const r = await inSociety(ws, (tx) => financialPosition(tx, ws.actor, asOf));
    rows = [
      ["Section", "Code", "Account", "Amount"],
      ...r.assets.map((l) => ["Assets", l.code, l.name, naira(l.amount)]),
      ...r.liabilities.map((l) => ["Liabilities", l.code, l.name, naira(l.amount)]),
      ...r.equity.map((l) => ["Members' funds", l.code, l.name, naira(l.amount)]),
      ["Members' funds", "", "Accumulated surplus", naira(r.surplus)],
    ];
    name = `financial-position-${asOf}`;
  } else if (report === "income") {
    const to = validDate(q.get("to") ?? undefined, todayIso());
    const from = validDate(q.get("from") ?? undefined, financialYearStart(to, society.financialYearStart));
    const r = await inSociety(ws, (tx) => incomeStatement(tx, ws.actor, from, to));
    rows = [
      ["Section", "Code", "Account", "Amount"],
      ...r.income.map((l) => ["Income", l.code, l.name, naira(l.amount)]),
      ...r.expenses.map((l) => ["Expenditure", l.code, l.name, naira(l.amount)]),
      ["Result", "", "Surplus", naira(r.totals.surplus)],
      ["Result", "", "Statutory reserve (25%)", naira(r.statutoryReserve)],
    ];
    name = `income-expenditure-${from}-to-${to}`;
  } else if (report === "loans") {
    const asOf = validDate(q.get("asOf") ?? undefined, todayIso());
    const r = await inSociety(ws, (tx) => loanAging(tx, ws.actor, asOf));
    rows = [
      ["Loan no.", "Member no.", "Member", "Product", "Outstanding", "Arrears", "Days late"],
      ...r.loans.map((l) => [l.loanNo, l.memberNo, l.memberName, l.productName, naira(l.position.principalOutstanding), naira(l.position.arrears), l.position.daysPastDue]),
    ];
    name = `loan-ageing-${asOf}`;
  } else return new Response("Unknown report", { status: 400 });
  return new Response("﻿" + toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" },
  });
}
