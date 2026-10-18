/**
 * Savings withdrawals: request (checked against the savings product's approved policy) →
 * decision by a different officer → payment as a journal submission another officer approves.
 *
 *   requested → approved → paying → paid
 *            ↘ rejected / cancelled     (payment rejected → approved again)
 */
import {
  can,
  checkWithdrawal,
  earliestPayment,
  kobo,
  loadSavingsPolicy,
  type Kobo,
  type StoredSavingsPolicy,
  type WithdrawalCheck,
} from "@techvaults/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { ledgerAccounts, members, products, withdrawals } from "../schema.js";
import { recordAudit } from "./audit.js";
import { isSelf, PermissionError, submitJournalEntry, type Actor } from "./ledger.js";

export class WithdrawalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WithdrawalError";
  }
}

type Row = typeof withdrawals.$inferSelect;
const OPEN = ["requested", "approved", "paying"] as const;
const today = () => new Date().toISOString().slice(0, 10);

async function savingsProduct(tx: Tx, productId: string) {
  const [p] = await tx.select().from(products).where(eq(products.id, productId));
  if (!p || p.kind !== "savings" || p.status !== "active" || !p.policy) throw new WithdrawalError("Choose an approved savings product.");
  return { product: p, policy: loadSavingsPolicy(p.policy as unknown as StoredSavingsPolicy) };
}

/** The member's balance on the product's account, and what's already requested but unpaid. */
async function position(tx: Tx, memberId: string, accountId: string, productId: string, excludeId?: string) {
  const [b] = await tx.execute<{ s: string }>(sql`
    select coalesce(sum(case side when 'credit' then amount else -amount end), 0)::text as s
    from journal_lines where member_id = ${memberId} and account_id = ${accountId}
  `);
  const open = await tx
    .select({ id: withdrawals.id, amount: withdrawals.amount })
    .from(withdrawals)
    .where(and(eq(withdrawals.memberId, memberId), eq(withdrawals.productId, productId), inArray(withdrawals.status, [...OPEN])));
  return { balance: kobo(BigInt(b?.s ?? "0")), pending: kobo(open.filter((o) => o.id !== excludeId).reduce((s, o) => s + o.amount, 0n)) };
}

const mayRequest = (actor: Actor, memberId: string) =>
  can(actor.roles, "ledger.prepare") || can(actor.roles, "members.write") || (isSelf(actor, memberId) && can(actor.roles, "self.apply"));

export async function withdrawalEligibility(
  tx: Tx,
  actor: Actor,
  input: { memberId: string; productId: string; amount: Kobo; requestedOn?: string },
): Promise<{ allowed: boolean; checks: WithdrawalCheck[]; balance: Kobo; pending: Kobo; earliestPayment: string }> {
  if (!mayRequest(actor, input.memberId)) throw new PermissionError("Your role cannot request withdrawals");
  const { product, policy } = await savingsProduct(tx, input.productId);
  const [member] = await tx.select().from(members).where(eq(members.id, input.memberId));
  if (!member) throw new WithdrawalError("Choose a member.");
  const pos = await position(tx, member.id, product.accountId, product.id);
  const r = checkWithdrawal(policy, { memberStatus: member.status, balance: pos.balance, pending: pos.pending, amount: input.amount });
  return { ...r, ...pos, earliestPayment: earliestPayment(input.requestedOn ?? today(), policy.withdrawalNoticeDays) };
}

export async function requestWithdrawal(
  tx: Tx,
  actor: Actor,
  input: { memberId: string; productId: string; amount: Kobo; reason?: string; requestedOn?: string },
): Promise<string> {
  const requestedOn = input.requestedOn ?? today();
  const e = await withdrawalEligibility(tx, actor, { ...input, requestedOn });
  if (!e.allowed) throw new WithdrawalError(`This request doesn't meet the product's rules: ${e.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join("; ")}.`);
  const [row] = await tx
    .insert(withdrawals)
    .values({
      societyId: actor.societyId,
      memberId: input.memberId,
      productId: input.productId,
      amount: input.amount,
      reason: input.reason?.trim() || null,
      requestedOn,
      earliestPayment: e.earliestPayment,
      requestedBy: actor.userId,
    })
    .returning({ id: withdrawals.id });
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "withdrawal.requested",
    entityType: "withdrawal",
    entityId: row!.id,
    after: { memberId: input.memberId, productId: input.productId, amount: input.amount, earliestPayment: e.earliestPayment },
  });
  return row!.id;
}

async function lock(tx: Tx, id: string): Promise<Row> {
  const [w] = await tx.select().from(withdrawals).where(eq(withdrawals.id, id)).for("update");
  if (!w) throw new WithdrawalError("Withdrawal not found.");
  return w;
}

/** Approve or decline a request. The person who recorded it can't decide it. */
export async function decideWithdrawal(tx: Tx, actor: Actor, id: string, decision: "approve" | "reject", reason: string): Promise<void> {
  if (!can(actor.roles, "ledger.approve")) throw new PermissionError("Your role cannot approve withdrawals");
  const w = await lock(tx, id);
  if (w.status !== "requested") throw new WithdrawalError(`This withdrawal is already ${w.status}.`);
  if (w.requestedBy === actor.userId) throw new PermissionError("The person who recorded this request cannot also decide it");
  if (decision === "reject" && reason.trim().length < 5) throw new WithdrawalError("Give the member a reason.");
  if (decision === "approve") {
    // The balance may have changed since the request; check again.
    const { product, policy } = await savingsProduct(tx, w.productId);
    const [member] = await tx.select().from(members).where(eq(members.id, w.memberId));
    const pos = await position(tx, w.memberId, product.accountId, product.id, w.id);
    const r = checkWithdrawal(policy, { memberStatus: member!.status, balance: pos.balance, pending: pos.pending, amount: kobo(w.amount) });
    if (!r.allowed) throw new WithdrawalError(`It no longer meets the rules: ${r.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join("; ")}.`);
  }
  const status = decision === "approve" ? "approved" : "rejected";
  await tx.update(withdrawals).set({ status, decidedBy: actor.userId, decidedAt: new Date(), decisionReason: reason.trim() || null }).where(eq(withdrawals.id, id));
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: `withdrawal.${status}`, entityType: "withdrawal", entityId: id, ...(reason.trim() ? { reason } : {}) });
}

export async function cancelWithdrawal(tx: Tx, actor: Actor, id: string): Promise<void> {
  const w = await lock(tx, id);
  if (!mayRequest(actor, w.memberId)) throw new PermissionError("Your role cannot cancel withdrawals");
  if (w.status !== "requested" && w.status !== "approved") throw new WithdrawalError(`A ${w.status} withdrawal can't be cancelled.`);
  await tx.update(withdrawals).set({ status: "cancelled" }).where(eq(withdrawals.id, id));
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: "withdrawal.cancelled", entityType: "withdrawal", entityId: id });
}

/** Prepare the payment: one journal submission another officer approves. It's paid when posted. */
export async function payWithdrawal(tx: Tx, actor: Actor, id: string, input: { bankAccountId: string; paidOn: string; idempotencyKey: string }): Promise<string> {
  if (!can(actor.roles, "ledger.prepare")) throw new PermissionError("Your role cannot prepare payments");
  const w = await lock(tx, id);
  if (w.status !== "approved") throw new WithdrawalError(w.status === "paying" ? "This payment is already waiting for approval." : `A ${w.status} withdrawal can't be paid.`);
  if (input.paidOn < w.earliestPayment) throw new WithdrawalError(`The notice period runs until ${w.earliestPayment}; it can't be paid before then.`);
  const [bank] = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, input.bankAccountId));
  if (!bank || bank.class !== "asset" || bank.isMemberControl || !bank.isActive) throw new WithdrawalError("Choose the bank or cash account it's paid from.");
  const { product } = await savingsProduct(tx, w.productId);
  const [member] = await tx.select({ memberNo: members.memberNo }).from(members).where(eq(members.id, w.memberId));
  const submission = await submitJournalEntry(tx, actor, {
    entryDate: input.paidOn,
    description: `Savings withdrawal – ${member!.memberNo}`,
    idempotencyKey: input.idempotencyKey,
    lines: [
      { accountId: product.accountId, side: "debit", amount: kobo(w.amount), memberId: w.memberId },
      { accountId: bank.id, side: "credit", amount: kobo(w.amount) },
    ],
  });
  await tx.update(withdrawals).set({ status: "paying", paymentSubmissionId: submission.id }).where(eq(withdrawals.id, id));
  await recordAudit(tx, { societyId: actor.societyId, actorId: actor.userId, action: "withdrawal.payment_prepared", entityType: "withdrawal", entityId: id, after: { submissionId: submission.id } });
  return submission.id;
}

export interface WithdrawalView {
  id: string;
  status: Row["status"];
  memberId: string;
  memberNo: string;
  memberName: string;
  productName: string;
  amount: Kobo;
  reason: string | null;
  requestedOn: string;
  earliestPayment: string;
  requestedBy: string;
  requestedByName: string;
  decidedByName: string | null;
  decisionReason: string | null;
}

export async function listWithdrawals(tx: Tx, actor: Actor, opts: { memberId?: string } = {}): Promise<WithdrawalView[]> {
  let memberId = opts.memberId;
  if (!can(actor.roles, "ledger.read") && !can(actor.roles, "members.read")) {
    if (!actor.memberId || !isSelf(actor, actor.memberId)) throw new PermissionError("Your role cannot view withdrawals");
    memberId = actor.memberId;
  }
  const rows = await tx.execute<{
    id: string;
    status: Row["status"];
    member_id: string;
    member_no: string;
    full_name: string;
    product_name: string;
    amount: string;
    reason: string | null;
    requested_on: string;
    earliest_payment: string;
    requested_by: string;
    requested_by_name: string;
    decided_by_name: string | null;
    decision_reason: string | null;
  }>(sql`
    select w.id, w.status, w.member_id, m.member_no, m.full_name, p.name as product_name, w.amount::text, w.reason,
           w.requested_on::text, w.earliest_payment::text, w.requested_by, r.name as requested_by_name, d.name as decided_by_name, w.decision_reason
    from withdrawals w
    join members m on m.id = w.member_id
    join products p on p.id = w.product_id
    join users r on r.id = w.requested_by
    left join users d on d.id = w.decided_by
    where w.society_id = ${actor.societyId} and ${memberId ? sql`w.member_id = ${memberId}` : sql`true`}
    order by w.requested_at desc
  `);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    memberId: r.member_id,
    memberNo: r.member_no,
    memberName: r.full_name,
    productName: r.product_name,
    amount: kobo(BigInt(r.amount)),
    reason: r.reason,
    requestedOn: r.requested_on,
    earliestPayment: r.earliest_payment,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    decidedByName: r.decided_by_name,
    decisionReason: r.decision_reason,
  }));
}
