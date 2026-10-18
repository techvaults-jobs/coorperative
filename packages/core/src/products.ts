/**
 * Savings and share product policies. Loan policies live in loans.ts.
 * These describe what a society has approved; posting still goes through the journal.
 */
import { kobo, type Kobo } from "./money.js";

export interface SavingsPolicy {
  /** Smallest regular contribution, in kobo. 0 for none. */
  minimumContribution: Kobo;
  /** Days' notice a member gives before withdrawing. */
  withdrawalNoticeDays: number;
  /** Whether members may withdraw while still members (some societies only refund on exit). */
  withdrawable: boolean;
}

export interface SharesPolicy {
  /** Price of one share, in kobo. */
  sharePrice: Kobo;
  /** Fewest shares a member must hold. */
  minimumShares: number;
}

export type StoredSavingsPolicy = Omit<SavingsPolicy, "minimumContribution"> & { minimumContribution: string };
export type StoredSharesPolicy = Omit<SharesPolicy, "sharePrice"> & { sharePrice: string };

export const storeSavingsPolicy = (p: SavingsPolicy): StoredSavingsPolicy => ({ ...p, minimumContribution: p.minimumContribution.toString() });
export const loadSavingsPolicy = (p: StoredSavingsPolicy): SavingsPolicy => ({ ...p, minimumContribution: kobo(BigInt(p.minimumContribution)) });
export const storeSharesPolicy = (p: SharesPolicy): StoredSharesPolicy => ({ ...p, sharePrice: p.sharePrice.toString() });
export const loadSharesPolicy = (p: StoredSharesPolicy): SharesPolicy => ({ ...p, sharePrice: kobo(BigInt(p.sharePrice)) });

export function validateSavingsPolicy(p: SavingsPolicy): string[] {
  const errors: string[] = [];
  if (p.minimumContribution < 0n) errors.push("The minimum contribution can't be negative.");
  if (!Number.isInteger(p.withdrawalNoticeDays) || p.withdrawalNoticeDays < 0 || p.withdrawalNoticeDays > 365) errors.push("Withdrawal notice must be 0 to 365 days.");
  return errors;
}

/**
 * The 1/5 share-holding cap (Co-operative Societies Act s.27, decision D-006) is a guardrail,
 * not a product setting, so it is not part of this policy.
 */
export function validateSharesPolicy(p: SharesPolicy): string[] {
  const errors: string[] = [];
  if (p.sharePrice <= 0n) errors.push("The share price must be more than ₦0.");
  if (!Number.isInteger(p.minimumShares) || p.minimumShares < 0 || p.minimumShares > 100_000) errors.push("Minimum shares must be 0 to 100,000.");
  return errors;
}

export const DEFAULT_SAVINGS_POLICY: SavingsPolicy = { minimumContribution: kobo(500_000), withdrawalNoticeDays: 30, withdrawable: true };
export const DEFAULT_SHARES_POLICY: SharesPolicy = { sharePrice: kobo(100_000), minimumShares: 5 };

// ---------------------------------------------------------------------------
// Withdrawals

export interface WithdrawalCheck {
  key: "status" | "allowed" | "amount" | "balance";
  label: string;
  ok: boolean;
  detail: string;
}

const nairaText = (k: bigint) => `₦${(Number(k) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Whether a member may withdraw `amount` from a savings product under its approved policy.
 * `pending` is what's already requested or approved but not yet paid.
 */
export function checkWithdrawal(
  policy: SavingsPolicy,
  input: { memberStatus: string; balance: Kobo; pending: Kobo; amount: Kobo },
): { allowed: boolean; checks: WithdrawalCheck[] } {
  const leaving = input.memberStatus === "exiting";
  const available = input.balance - input.pending;
  const checks: WithdrawalCheck[] = [
    { key: "status", label: "Member is active or leaving", ok: input.memberStatus === "active" || leaving, detail: `Status: ${input.memberStatus}` },
    {
      key: "allowed",
      label: policy.withdrawable ? "This product allows withdrawals" : "Withdrawals only when leaving the society",
      ok: policy.withdrawable || leaving,
      detail: policy.withdrawable ? "Allowed while a member" : leaving ? "Member is leaving" : "Member isn't leaving",
    },
    { key: "amount", label: "More than ₦0", ok: input.amount > 0n, detail: `Requested ${nairaText(input.amount)}` },
    {
      key: "balance",
      label: "Within the available balance",
      ok: input.amount <= available,
      detail: `Balance ${nairaText(input.balance)}${input.pending > 0n ? `, ${nairaText(input.pending)} already requested` : ""}`,
    },
  ];
  return { allowed: checks.every((c) => c.ok), checks };
}

/** The earliest date a withdrawal requested on `requestedOn` may be paid, after the notice period. */
export function earliestPayment(requestedOn: string, noticeDays: number): string {
  const d = new Date(`${requestedOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + noticeDays);
  return d.toISOString().slice(0, 10);
}
