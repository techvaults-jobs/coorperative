import { formatNaira, INTEREST_METHOD_LABELS, type LoanPolicy, type SavingsPolicy, type SharesPolicy } from "@techvaults/core";
import type { ProductKind } from "@techvaults/db";
import { bpsToPercent } from "@/lib/policy-form";

type Policy = LoanPolicy | SavingsPolicy | SharesPolicy;

/** A product policy as plain terms, e.g. "12% a year · reducing balance". */
export function policyTerms(kind: ProductKind, policy: Policy): [string, string][] {
  if (kind === "loan") {
    const p = policy as LoanPolicy;
    return [
      ["Interest", `${bpsToPercent(p.annualRateBps)} a year`],
      ["Method", INTEREST_METHOD_LABELS[p.interestMethod].label],
      ["Amount", `${formatNaira(p.minAmount)} – ${formatNaira(p.maxAmount)}`],
      ["Term", `${p.minTermMonths}–${p.maxTermMonths} months`],
      ["Savings limit", p.savingsMultiple === null ? "None" : `${p.savingsMultiple}× savings`],
      ["Guarantors", String(p.guarantorsRequired)],
      ["Processing fee", bpsToPercent(p.processingFeeBps)],
      ["Membership", `${p.minMembershipMonths} months minimum`],
      ["Running loans", `Up to ${p.maxActiveLoans}`],
    ];
  }
  if (kind === "savings") {
    const p = policy as SavingsPolicy;
    return [
      ["Minimum contribution", formatNaira(p.minimumContribution)],
      ["Withdrawal notice", `${p.withdrawalNoticeDays} days`],
      ["Withdrawals", p.withdrawable ? "Allowed while a member" : "Only on exit"],
    ];
  }
  const p = policy as SharesPolicy;
  return [
    ["Share price", formatNaira(p.sharePrice)],
    ["Minimum holding", `${p.minimumShares} shares`],
    ["Holding cap", "1/5 of all shares (Act s.27)"],
  ];
}

export function PolicyGrid({ kind, policy, compare }: { kind: ProductKind; policy: Policy; compare?: Policy | null }) {
  const before = compare ? new Map(policyTerms(kind, compare)) : null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {policyTerms(kind, policy).map(([label, value]) => {
        const changed = before && before.get(label) !== value;
        return (
          <div key={label} className="flex flex-col">
            <dt className="text-muted text-xs">{label}</dt>
            <dd className={changed ? "text-sm font-semibold" : "text-sm"}>
              {value}
              {changed && <span className="text-muted ml-1.5 text-xs font-normal line-through">{before!.get(label)}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
