import { getProduct } from "@techvaults/db";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { ProductForm } from "../../product-form";

export const metadata = { title: "Propose change" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "settings.manage") && !hasPermission(ws, "accounts.manage")) return <EmptyState title="Your role can't propose product changes." />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const product = await inSociety(ws, (tx) => getProduct(tx, ws.actor, id));
  if (!product || !product.policy) notFound();
  return (
    <>
      <PageHeader
        back={{ href: `/products?kind=${product.kind}`, label: "Products" }}
        title={`Change ${product.name}`}
        description="The current policy stays in force until another officer approves the change. Loans already granted keep their original terms."
      />
      <ProductForm kind={product.kind} productId={product.id} policy={product.policy} accounts={[]} incomeAccounts={[]} />
    </>
  );
}
