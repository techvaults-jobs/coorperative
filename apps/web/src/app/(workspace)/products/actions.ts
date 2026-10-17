"use server";

import {
  approveProductPolicy,
  PermissionError,
  proposePolicyChange,
  proposeProduct,
  rejectProductPolicy,
  retireProduct,
  SettingsError,
  type ProductKind,
} from "@techvaults/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readPolicy } from "@/lib/policy-form";
import { inSociety, requireWorkspace } from "@/lib/session";
import type { FormState } from "../actions";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const KINDS = ["savings", "shares", "loan"] as const;

function explain(e: unknown): string {
  if (e instanceof SettingsError || e instanceof PermissionError) return e.message;
  console.error(e);
  return "Something went wrong and nothing was saved. Try again.";
}

export async function saveProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const productId = text(formData, "productId");
  const kind = text(formData, "kind") as ProductKind;
  if (!KINDS.includes(kind)) return { ok: false, message: "Choose a product type." };
  const policy = readPolicy(kind, formData);
  try {
    await inSociety(ws, async (tx) => {
      if (productId) return proposePolicyChange(tx, ws.actor, productId, policy);
      await proposeProduct(tx, ws.actor, {
        ...policy,
        code: text(formData, "code"),
        name: text(formData, "name"),
        description: text(formData, "description"),
        accountId: text(formData, "accountId"),
        incomeAccountId: text(formData, "incomeAccountId") || null,
      });
    });
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/products");
  redirect(`/products?kind=${kind}&done=${productId ? "change" : "proposed"}`);
}

export async function decideProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  const productId = text(formData, "productId");
  const decision = text(formData, "decision");
  try {
    await inSociety(ws, (tx) => {
      if (decision === "approve") return approveProductPolicy(tx, ws.actor, productId);
      if (decision === "reject") return rejectProductPolicy(tx, ws.actor, productId, text(formData, "reason"));
      if (decision === "retire") return retireProduct(tx, ws.actor, productId, text(formData, "reason"));
      throw new SettingsError("Unknown decision.");
    });
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
  revalidatePath("/products");
  return { ok: true, message: decision === "approve" ? "Approved. It's in force from now on." : decision === "reject" ? "Sent back to the proposer." : "Retired." };
}
