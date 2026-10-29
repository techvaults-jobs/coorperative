import { formatNaira, INTEREST_METHOD_LABELS, type LoanPolicy } from "@techvaults/core";
import { listProducts, withSociety } from "@techvaults/db";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { rateText } from "@/lib/policy-form";
import { requirePortal } from "@/lib/session";
import { requirePortalSociety } from "@/lib/society";
import { MemberApplyForm } from "./member-apply-form";

export const metadata = { title: "Apply for a loan" };

export default async function ApplyPage() {
  const me = await requirePortal();
  const society = await requirePortalSociety();
  if (!society.modules.includes("loans")) notFound();
  const products = (await withSociety(db(), me.society.societyId, (tx) => listProducts(tx, me.actor, { kind: "loan" }))).filter((p) => p.status === "active" && p.policy);
  return (
    <>
      <PageHeader
        back={{ href: "/my", label: "Home" }}
        title="Apply for a loan"
        description="Your application is checked against the society's approved rules as you fill it in. The loan committee makes the decision."
      />
      {products.length === 0 ? (
        <p className="text-muted text-sm">Your society hasn&apos;t set up loan products yet.</p>
      ) : (
        <MemberApplyForm
          products={products.map((p) => {
            const policy = p.policy as LoanPolicy;
            return {
              id: p.id,
              label: p.name,
              summary: `${rateText(policy)}, ${INTEREST_METHOD_LABELS[policy.interestMethod].label.toLowerCase()} · up to ${formatNaira(policy.maxAmount)} · ${policy.minTermMonths}–${policy.maxTermMonths} months`,
              guarantors: policy.guarantorsRequired,
              maxTerm: policy.maxTermMonths,
              minTerm: policy.minTermMonths,
            };
          })}
        />
      )}
    </>
  );
}
