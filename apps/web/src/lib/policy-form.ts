// Shared by server actions and client forms, so it imports only the browser-safe core.
import {
  INTEREST_METHODS,
  kobo,
  parseNaira,
  type InterestMethod,
  type LoanPolicy,
  type SavingsPolicy,
  type SharesPolicy,
} from "@techvaults/core/browser";
import type { AnyPolicy, ProductKind } from "@techvaults/db";

/** "12.5" → 1250 basis points. NaN when the input isn't a number. */
export function percentToBps(input: string): number {
  const n = Number(input.trim().replace("%", ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export const bpsToPercent = (bps: number) => `${(bps / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}%`;
/** A loan rate as members say it: "1.5% a month" for flexible weekly loans (D-028), "12% a year" otherwise. */
export const rateText = (p: Pick<LoanPolicy, "interestMethod" | "annualRateBps">) =>
  p.interestMethod === "flexible_weekly" ? `${bpsToPercent(p.annualRateBps / 12)} a month` : `${bpsToPercent(p.annualRateBps)} a year`;
export const koboToNairaInput = (k: bigint) => (Number(k) / 100).toFixed(2).replace(/\.00$/, "");

function naira(form: FormData, key: string) {
  try {
    return parseNaira(String(form.get(key) ?? "0") || "0");
  } catch {
    return kobo(-1);
  }
}
const int = (form: FormData, key: string) => Number.parseInt(String(form.get(key) ?? ""), 10);

/** Read a product policy from a submitted form; validation happens in the service. */
export function readPolicy(kind: ProductKind, form: FormData): AnyPolicy {
  if (kind === "loan") {
    const method = String(form.get("interestMethod"));
    const multiple = String(form.get("savingsMultiple") ?? "").trim();
    const policy: LoanPolicy = {
      interestMethod: ((INTEREST_METHODS as readonly string[]).includes(method) ? method : "reducing_balance") as InterestMethod,
      annualRateBps: percentToBps(String(form.get("annualRate") ?? "")),
      minTermMonths: int(form, "minTermMonths"),
      maxTermMonths: int(form, "maxTermMonths"),
      minAmount: naira(form, "minAmount"),
      maxAmount: naira(form, "maxAmount"),
      savingsMultiple: multiple ? Number(multiple) : null,
      guarantorsRequired: int(form, "guarantorsRequired"),
      processingFeeBps: percentToBps(String(form.get("processingFee") ?? "0") || "0"),
      minMembershipMonths: int(form, "minMembershipMonths"),
      maxActiveLoans: int(form, "maxActiveLoans"),
    };
    return { kind, policy };
  }
  if (kind === "savings") {
    const policy: SavingsPolicy = {
      minimumContribution: naira(form, "minimumContribution"),
      withdrawalNoticeDays: int(form, "withdrawalNoticeDays"),
      withdrawable: form.get("withdrawable") === "on",
    };
    return { kind, policy };
  }
  const policy: SharesPolicy = { sharePrice: naira(form, "sharePrice"), minimumShares: int(form, "minimumShares") };
  return { kind, policy };
}
