/**
 * Savings, share and loan products. A product, and every change to its policy, takes effect
 * only when an officer with settings.approve who did not propose it approves it.
 */
import {
  can,
  loadLoanPolicy,
  loadSavingsPolicy,
  loadSharesPolicy,
  storeLoanPolicy,
  storeSavingsPolicy,
  storeSharesPolicy,
  validateLoanPolicy,
  validateSavingsPolicy,
  validateSharesPolicy,
  type LoanPolicy,
  type SavingsPolicy,
  type SharesPolicy,
  type StoredLoanPolicy,
  type StoredSavingsPolicy,
  type StoredSharesPolicy,
} from "@techvaults/core";
import { asc, eq, inArray } from "drizzle-orm";
import type { Tx } from "../client.js";
import { ledgerAccounts, products, users } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError, type Actor } from "./ledger.js";
import { SettingsError } from "./settings.js";

export type ProductKind = "savings" | "shares" | "loan";
export type AnyPolicy = { kind: "savings"; policy: SavingsPolicy } | { kind: "shares"; policy: SharesPolicy } | { kind: "loan"; policy: LoanPolicy };

export interface ProductView {
  id: string;
  kind: ProductKind;
  code: string;
  name: string;
  description: string | null;
  status: "proposed" | "active" | "retired";
  version: number;
  account: { id: string; code: string; name: string };
  incomeAccount: { id: string; code: string; name: string } | null;
  policy: AnyPolicy["policy"] | null;
  proposedPolicy: AnyPolicy["policy"] | null;
  proposedBy: string | null;
  proposedByName: string | null;
  proposedAt: Date | null;
  approvedByName: string | null;
  approvedAt: Date | null;
}

function load(kind: ProductKind, stored: Record<string, unknown> | null): AnyPolicy["policy"] | null {
  if (!stored) return null;
  if (kind === "loan") return loadLoanPolicy(stored as unknown as StoredLoanPolicy);
  if (kind === "savings") return loadSavingsPolicy(stored as unknown as StoredSavingsPolicy);
  return loadSharesPolicy(stored as unknown as StoredSharesPolicy);
}

function store(p: AnyPolicy): Record<string, unknown> {
  if (p.kind === "loan") return storeLoanPolicy(p.policy) as unknown as Record<string, unknown>;
  if (p.kind === "savings") return storeSavingsPolicy(p.policy) as unknown as Record<string, unknown>;
  return storeSharesPolicy(p.policy) as unknown as Record<string, unknown>;
}

function validate(p: AnyPolicy): string[] {
  if (p.kind === "loan") return validateLoanPolicy(p.policy);
  if (p.kind === "savings") return validateSavingsPolicy(p.policy);
  return validateSharesPolicy(p.policy);
}

/** Which kind of member account each product kind keeps its balances on. */
const ACCOUNT_CLASS: Record<ProductKind, string> = { loan: "asset", savings: "liability", shares: "equity" };

const canPropose = (actor: Actor) => can(actor.roles, "settings.manage") || can(actor.roles, "accounts.manage");

export async function listProducts(tx: Tx, actor: Actor, opts: { kind?: ProductKind } = {}): Promise<ProductView[]> {
  // Every officer may see their society's products. The explicit society filter backs up RLS.
  const rows = await tx.select().from(products).where(eq(products.societyId, actor.societyId)).orderBy(asc(products.kind), asc(products.code));
  const accounts = new Map((await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.societyId, actor.societyId))).map((a) => [a.id, a]));
  const ids = [...new Set(rows.flatMap((r) => [r.proposedBy, r.approvedBy].filter((x): x is string => !!x)))];
  const people = new Map(ids.length ? (await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.name]) : []);
  return rows
    .filter((r) => !opts.kind || r.kind === opts.kind)
    .map((r) => {
      const account = accounts.get(r.accountId)!;
      const income = r.incomeAccountId ? accounts.get(r.incomeAccountId) : undefined;
      return {
        id: r.id,
        kind: r.kind,
        code: r.code,
        name: r.name,
        description: r.description,
        status: r.status,
        version: r.version,
        account: { id: account.id, code: account.code, name: account.name },
        incomeAccount: income ? { id: income.id, code: income.code, name: income.name } : null,
        policy: load(r.kind, r.policy),
        proposedPolicy: load(r.kind, r.proposedPolicy),
        proposedBy: r.proposedBy,
        proposedByName: r.proposedBy ? (people.get(r.proposedBy) ?? null) : null,
        proposedAt: r.proposedAt,
        approvedByName: r.approvedBy ? (people.get(r.approvedBy) ?? null) : null,
        approvedAt: r.approvedAt,
      };
    });
}

export async function getProduct(tx: Tx, actor: Actor, id: string): Promise<ProductView | undefined> {
  return (await listProducts(tx, actor)).find((p) => p.id === id);
}

/** Propose a new product. It can't be used until a second officer approves it. */
export async function proposeProduct(
  tx: Tx,
  actor: Actor,
  input: { code: string; name: string; description?: string | null; accountId: string; incomeAccountId?: string | null } & AnyPolicy,
): Promise<string> {
  if (!canPropose(actor)) throw new PermissionError("Your role cannot propose products");
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,12}$/.test(code)) throw new SettingsError("Product codes are 2–12 letters, digits or dashes, e.g. REG-LOAN.");
  if (input.name.trim().length < 3) throw new SettingsError("Give the product a name members will recognise.");
  const errors = validate(input);
  if (errors.length) throw new SettingsError(errors.join(" "));
  const [account] = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, input.accountId));
  if (!account || !account.isMemberControl || account.class !== ACCOUNT_CLASS[input.kind] || !account.isActive) {
    throw new SettingsError(`Choose an active ${ACCOUNT_CLASS[input.kind]} account that holds member balances.`);
  }
  if (input.kind === "loan") {
    const [income] = input.incomeAccountId ? await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, input.incomeAccountId)) : [];
    if (!income || income.class !== "income" || !income.isActive) throw new SettingsError("Choose the income account loan interest and fees are credited to.");
  }
  let row;
  try {
    [row] = await tx
      .insert(products)
      .values({
        societyId: actor.societyId,
        kind: input.kind,
        code,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        accountId: input.accountId,
        incomeAccountId: input.kind === "loan" ? input.incomeAccountId! : null,
        status: "proposed",
        proposedPolicy: store(input),
        proposedBy: actor.userId,
        proposedAt: new Date(),
      })
      .returning({ id: products.id });
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new SettingsError(`Product code ${code} is already in use.`);
    throw e;
  }
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "product.proposed",
    entityType: "product",
    entityId: row!.id,
    after: { code, name: input.name.trim(), kind: input.kind, policy: store(input) },
  });
  return row!.id;
}

/** Propose a change to an active product's policy. The current policy stays in force until approved. */
export async function proposePolicyChange(tx: Tx, actor: Actor, productId: string, change: AnyPolicy): Promise<void> {
  if (!canPropose(actor)) throw new PermissionError("Your role cannot propose product changes");
  const [p] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
  if (!p) throw new SettingsError("Product not found.");
  if (p.kind !== change.kind) throw new SettingsError("That policy is for a different kind of product.");
  if (p.status === "retired") throw new SettingsError("A retired product can't be changed.");
  const errors = validate(change);
  if (errors.length) throw new SettingsError(errors.join(" "));
  await tx.update(products).set({ proposedPolicy: store(change), proposedBy: actor.userId, proposedAt: new Date() }).where(eq(products.id, productId));
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "product.change_proposed",
    entityType: "product",
    entityId: productId,
    before: { policy: p.policy },
    after: { policy: store(change) },
  });
}

/** Approve a proposed product or policy change. The approver must not be the proposer. */
export async function approveProductPolicy(tx: Tx, actor: Actor, productId: string): Promise<void> {
  if (!can(actor.roles, "settings.approve")) throw new PermissionError("Your role cannot approve products");
  const [p] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
  if (!p || !p.proposedPolicy) throw new SettingsError("There's nothing waiting for approval on this product.");
  if (p.proposedBy === actor.userId) throw new PermissionError("The person who proposed this cannot also approve it");
  await tx
    .update(products)
    .set({ policy: p.proposedPolicy, proposedPolicy: null, status: "active", version: p.version + 1, approvedBy: actor.userId, approvedAt: new Date() })
    .where(eq(products.id, productId));
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: p.version === 0 ? "product.approved" : "product.change_approved",
    entityType: "product",
    entityId: productId,
    before: { policy: p.policy, version: p.version },
    after: { policy: p.proposedPolicy, version: p.version + 1 },
  });
}

export async function rejectProductPolicy(tx: Tx, actor: Actor, productId: string, reason: string): Promise<void> {
  if (!can(actor.roles, "settings.approve")) throw new PermissionError("Your role cannot approve products");
  if (reason.trim().length < 5) throw new SettingsError("Give a reason the proposer can act on.");
  const [p] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
  if (!p || !p.proposedPolicy) throw new SettingsError("There's nothing waiting for approval on this product.");
  if (p.proposedBy === actor.userId) throw new PermissionError("The person who proposed this cannot also decide on it");
  await tx
    .update(products)
    .set({ proposedPolicy: null, status: p.version === 0 ? "retired" : p.status })
    .where(eq(products.id, productId));
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "product.change_rejected",
    entityType: "product",
    entityId: productId,
    before: { proposedPolicy: p.proposedPolicy },
    reason,
  });
}

/** Stop offering a product. Existing loans and balances are unaffected. */
export async function retireProduct(tx: Tx, actor: Actor, productId: string, reason: string): Promise<void> {
  if (!can(actor.roles, "settings.approve")) throw new PermissionError("Your role cannot retire products");
  if (reason.trim().length < 5) throw new SettingsError("Give a reason for retiring the product.");
  const [p] = await tx.update(products).set({ status: "retired", proposedPolicy: null }).where(eq(products.id, productId)).returning();
  if (!p) throw new SettingsError("Product not found.");
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: "product.retired", entityType: "product", entityId: productId, reason });
}
