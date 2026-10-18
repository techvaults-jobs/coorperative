"use server";

import { formatNaira } from "@techvaults/core";
import { ImportError, importMembers, PermissionError, previewLegacyLoans, previewMemberImport, previewOpeningBalances, submitLegacyLoans, submitOpeningBalances, type OpeningPreview } from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { inSociety, requireWorkspace } from "@/lib/session";

export type ImportState = {
  ok: boolean;
  step: "preview" | "done";
  message?: string;
  csv?: string;
  issues?: { line: number; message: string }[];
  rows?: string[][];
  headers?: string[];
  summary?: string;
  /** Opening balances: the date chosen at preview, carried to the import. */
  asOf?: string;
};

async function readCsv(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) throw new ImportError("That file is too large (2 MB at most). Split it and import in parts.");
    return file.text();
  }
  return String(formData.get("csv") ?? "");
}

function explain(e: unknown): string {
  if (e instanceof ImportError || e instanceof PermissionError) return e.message;
  console.error(e);
  return "Something went wrong and nothing was saved. Try again.";
}

export async function membersImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ws = await requireWorkspace();
  const commit = formData.get("commit") === "1";
  try {
    const csv = commit ? String(formData.get("csv") ?? "") : await readCsv(formData);
    if (!csv.trim()) return { ok: false, step: "preview", message: "Choose a file or paste its contents." };
    if (commit) {
      const n = await inSociety(ws, (tx) => importMembers(tx, ws.actor, csv));
      revalidatePath("/members");
      return { ok: true, step: "done", message: `${n.toLocaleString("en-NG")} members added to the register.` };
    }
    const p = await inSociety(ws, (tx) => previewMemberImport(tx, ws.actor, csv));
    return {
      ok: p.issues.length === 0 && p.rows.length > 0,
      step: "preview",
      csv,
      issues: p.issues,
      headers: ["Line", "Member no", "Full name", "ID", "Group", "Joined", "Status"],
      rows: p.rows.slice(0, 200).map((r) => [String(r.line), r.memberNo, r.fullName, r.externalId ?? "", r.group ?? "", r.joinedOn ?? "", r.status]),
      summary: `${p.rows.length.toLocaleString("en-NG")} member${p.rows.length === 1 ? "" : "s"} ready${p.issues.length ? `, ${p.issues.length} line${p.issues.length === 1 ? "" : "s"} to fix` : ""}.`,
    };
  } catch (e) {
    return { ok: false, step: "preview", message: explain(e) };
  }
}

export async function balancesImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ws = await requireWorkspace();
  const commit = formData.get("commit") === "1";
  const asOf = String(formData.get("asOf") ?? "");
  try {
    const csv = commit ? String(formData.get("csv") ?? "") : await readCsv(formData);
    if (!csv.trim()) return { ok: false, step: "preview", message: "Choose a file or paste its contents." };
    if (commit) {
      const s = await inSociety(ws, (tx) => submitOpeningBalances(tx, ws.actor, csv, asOf));
      revalidatePath("/approvals");
      return {
        ok: true,
        step: "done",
        message: s.created
          ? `Opening balances for ${s.members} members (${formatNaira(s.total)}) prepared. They reach the ledger when another officer approves the entry in Approvals.`
          : "This file was already prepared; nothing was duplicated.",
      };
    }
    const p: OpeningPreview = await inSociety(ws, (tx) => previewOpeningBalances(tx, ws.actor, csv));
    const codes = p.accounts.map((a) => a.code);
    return {
      ok: p.issues.length === 0 && p.lines.length > 0,
      step: "preview",
      csv,
      issues: p.issues,
      headers: ["Line", "Member", ...p.accounts.map((a) => `${a.code} ${a.name}`)],
      rows: p.lines.slice(0, 200).map((l) => [String(l.line), `${l.memberNo} · ${l.memberName}`, ...codes.map((c) => (l.amounts[c] ? formatNaira(l.amounts[c]!) : ""))]),
      asOf,
      summary: `${p.lines.length.toLocaleString("en-NG")} members as at ${asOf}, ${formatNaira(p.total)} in total (${p.accounts.map((a) => `${a.code}: ${formatNaira(a.total)}`).join(", ")}).`,
    };
  } catch (e) {
    return { ok: false, step: "preview", message: explain(e) };
  }
}

export async function loansImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ws = await requireWorkspace();
  const commit = formData.get("commit") === "1";
  const asOf = String(formData.get("asOf") ?? "");
  try {
    const csv = commit ? String(formData.get("csv") ?? "") : await readCsv(formData);
    if (!csv.trim()) return { ok: false, step: "preview", message: "Choose a file or paste its contents." };
    if (commit) {
      const r = await inSociety(ws, (tx) => submitLegacyLoans(tx, ws.actor, csv, asOf));
      revalidatePath("/approvals");
      revalidatePath("/loans");
      return { ok: true, step: "done", message: `${r.loans} running loans (${formatNaira(r.total)}) prepared. They go live when another officer approves the entry in Approvals.` };
    }
    const p = await inSociety(ws, (tx) => previewLegacyLoans(tx, ws.actor, csv, asOf));
    return {
      ok: p.issues.length === 0 && p.loans.length > 0,
      step: "preview",
      csv,
      asOf,
      issues: p.issues,
      headers: ["Line", "Member", "Product", "Outstanding", "Months left", "Next due", "New monthly payment"],
      rows: p.loans.slice(0, 200).map((l) => [String(l.line), `${l.memberNo} · ${l.memberName}`, l.productCode, formatNaira(l.outstanding), String(l.remainingMonths), l.nextDue, formatNaira(l.monthlyPayment)]),
      summary: `${p.loans.length} loans, ${formatNaira(p.total)} outstanding as at ${asOf}. Check the new monthly payments against your records: the remaining balance is spread over the remaining months at the product's approved rate.`,
    };
  } catch (e) {
    return { ok: false, step: "preview", message: explain(e) };
  }
}
