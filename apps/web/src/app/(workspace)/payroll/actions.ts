"use server";

import { parseNaira } from "@techvaults/core";
import {
  createPayrollRun,
  importRemittance,
  issuePayrollRun,
  LoanError,
  PayrollError,
  PermissionError,
  rebuildPayrollRun,
  setContribution,
  submitPayrollRun,
} from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inSociety, requireWorkspace } from "@/lib/session";
import type { FormState } from "../actions";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function explain(e: unknown): string {
  if (e instanceof PayrollError || e instanceof PermissionError || e instanceof LoanError) return e.message;
  console.error(e);
  return "Something went wrong and nothing was saved. Try again.";
}

export async function startRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  let id: string;
  try {
    id = await inSociety(ws, (tx) => createPayrollRun(tx, ws.actor, { period: text(formData, "period"), strategy: text(formData, "strategy") }));
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/payroll");
  redirect(`/payroll/${id}`);
}

export type ImportState = FormState & { errors?: { line: number; message: string }[] };

/** Run a step on a payroll run and come back to its page. */
export async function runStepAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ws = await requireWorkspace();
  const runId = text(formData, "runId");
  const step = text(formData, "step");
  try {
    if (step === "rebuild") await inSociety(ws, (tx) => rebuildPayrollRun(tx, ws.actor, runId));
    else if (step === "issue") await inSociety(ws, (tx) => issuePayrollRun(tx, ws.actor, runId));
    else if (step === "import") {
      const file = formData.get("file");
      const csv = file instanceof File && file.size > 0 ? await file.text() : text(formData, "csv");
      if (!csv) return { ok: false, message: "Choose the employer's file, or paste its contents." };
      if (csv.length > 2_000_000) return { ok: false, message: "That file is too large (2 MB at most)." };
      const r = await inSociety(ws, (tx) => importRemittance(tx, ws.actor, runId, csv, text(formData, "receivedOn")));
      if (r.errors.length) return { ok: false, message: "The file couldn't be read. Nothing was loaded.", errors: r.errors.slice(0, 20) };
    } else if (step === "submit") {
      await inSociety(ws, (tx) => submitPayrollRun(tx, ws.actor, runId, { bankAccountId: text(formData, "bankAccountId"), idempotencyKey: text(formData, "idempotencyKey") }));
      revalidatePath("/approvals");
    } else return { ok: false, message: "Unknown step." };
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath(`/payroll/${runId}`);
  revalidatePath("/payroll");
  redirect(`/payroll/${runId}?done=${step}`);
}

export async function setContributionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const memberId = text(formData, "memberId");
  try {
    const entries = [...formData.entries()].filter(([k]) => k.startsWith("amount:"));
    await inSociety(ws, async (tx) => {
      for (const [key, value] of entries) {
        const raw = String(value).trim();
        await setContribution(tx, ws.actor, memberId, key.slice("amount:".length), raw ? parseNaira(raw) : parseNaira("0"));
      }
    });
  } catch (e) {
    if (e instanceof SyntaxError) return { ok: false, message: "Enter amounts like 10000 or 10,000.50." };
    return { ok: false, message: explain(e) };
  }
  revalidatePath(`/members/${memberId}`);
  return { ok: true, message: "Monthly contributions saved." };
}
