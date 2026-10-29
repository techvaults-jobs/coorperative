import { formatNaira, INTEREST_METHOD_LABELS, type LoanPolicy } from "@techvaults/core";
import { listMembers, listProducts } from "@techvaults/db";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { rateText } from "@/lib/policy-form";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { ApplicationForm } from "./application-form";

export const metadata = { title: "New loan application" };

export default async function NewLoanPage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "loans.prepare")) return <EmptyState title="Your role can't record loan applications." />;
  const { member } = await searchParams;
  const { members, products } = await inSociety(ws, async (tx) => ({
    members: (await listMembers(tx, ws.actor)).filter((m) => m.status === "active"),
    products: (await listProducts(tx, ws.actor, { kind: "loan" })).filter((p) => p.status === "active" && p.policy),
  }));
  if (products.length === 0) {
    return (
      <EmptyState title="No loan products are approved yet." action={<Link href="/products/new?kind=loan" className={buttonClass("primary")}>Propose a loan product</Link>}>
        A loan product sets the rate, limits and rules applications are checked against.
      </EmptyState>
    );
  }
  return (
    <>
      <PageHeader
        back={{ href: "/loans", label: "Loans" }}
        title="New loan application"
        description="The application is checked against the product's approved policy as you type. A committee member decides it; you can't decide applications you record."
      />
      <ApplicationForm
        initialMemberId={member}
        members={members.map((m) => ({ id: m.id, label: `${m.memberNo} · ${m.fullName}` }))}
        products={products.map((p) => {
          const policy = p.policy as LoanPolicy;
          return {
            id: p.id,
            label: p.name,
            summary: `${rateText(policy)}, ${INTEREST_METHOD_LABELS[policy.interestMethod].label.toLowerCase()} · ${formatNaira(policy.minAmount)}–${formatNaira(policy.maxAmount)} · ${policy.minTermMonths}–${policy.maxTermMonths} months`,
            guarantors: policy.guarantorsRequired,
            maxTerm: policy.maxTermMonths,
            minTerm: policy.minTermMonths,
          };
        })}
      />
    </>
  );
}
