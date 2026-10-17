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
