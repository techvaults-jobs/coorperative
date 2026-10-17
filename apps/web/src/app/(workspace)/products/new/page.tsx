import { DEFAULT_LOAN_POLICY, DEFAULT_SAVINGS_POLICY, DEFAULT_SHARES_POLICY } from "@techvaults/core";
import { listChartOfAccounts, type ProductKind } from "@techvaults/db";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };

const CLASS = { loan: "asset", savings: "liability", shares: "equity" } as const;

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "settings.manage") && !hasPermission(ws, "accounts.manage")) return <EmptyState title="Your role can't propose products." />;
  const { kind: k } = await searchParams;
  const kind: ProductKind = k === "savings" || k === "shares" ? k : "loan";
  const accounts = await inSociety(ws, (tx) => listChartOfAccounts(tx, ws.actor));
  const memberAccounts = accounts.filter((a) => a.isActive && a.isMemberControl && a.class === CLASS[kind]);
  const income = accounts.filter((a) => a.isActive && a.class === "income");
  const label = (a: (typeof accounts)[number]) => ({ id: a.id, label: `${a.code} · ${a.name}` });
  return (
    <>
      <PageHeader
        back={{ href: `/products?kind=${kind}`, label: "Products" }}
        title={`New ${kind === "loan" ? "loan" : kind === "savings" ? "savings" : "share"} product`}
        description="Start from sensible defaults and set them to your society's approved bye-laws. It goes live when another officer approves it."
      />
      {memberAccounts.length === 0 ? (
        <EmptyState title={`Add a ${CLASS[kind]} account that holds member balances first.`}>Go to Settings → Chart of accounts.</EmptyState>
      ) : (
        <ProductForm
          kind={kind}
          policy={kind === "loan" ? DEFAULT_LOAN_POLICY : kind === "savings" ? DEFAULT_SAVINGS_POLICY : DEFAULT_SHARES_POLICY}
          accounts={memberAccounts.map(label)}
          incomeAccounts={income.map(label)}
        />
      )}
    </>
  );
}
