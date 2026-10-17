import { listProducts, type ProductKind } from "@techvaults/db";
import { HandCoins, Landmark, Package, PiggyBank, Plus } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { DecideProductForm } from "./decide-form";
import { PolicyGrid } from "./policy-summary";

export const metadata = { title: "Products" };

const KIND = {
  loan: { label: "Loans", one: "loan product", icon: HandCoins },
  savings: { label: "Savings", one: "savings product", icon: PiggyBank },
  shares: { label: "Shares", one: "share product", icon: Landmark },
} as const;

const DONE: Record<string, string> = {
  proposed: "Product proposed. It can be used once another officer approves it.",
  change: "Change proposed. The current policy stays in force until another officer approves it.",
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ kind?: string; done?: string }> }) {
  const ws = await requireWorkspace();
  const canPropose = hasPermission(ws, "settings.manage") || hasPermission(ws, "accounts.manage");
  const canApprove = hasPermission(ws, "settings.approve");
  if (!canPropose && !canApprove) return <EmptyState title="Your role doesn't include products." />;
  const { kind: kindParam, done } = await searchParams;
  const kind: ProductKind = kindParam === "savings" || kindParam === "shares" ? kindParam : "loan";
  const all = await inSociety(ws, (tx) => listProducts(tx, ws.actor));
  const shown = all.filter((p) => p.kind === kind).sort((a, b) => Number(a.status === "retired") - Number(b.status === "retired"));
  const waiting = all.filter((p) => p.proposedPolicy).length;

  return (
    <>
      <PageHeader
        title="Products"
        description="The savings, share and loan products your society offers, and the approved policy behind each. Every product and change needs a second officer's approval."
        actions={
          canPropose && (
            <Link href={`/products/new?kind=${kind}`} className={buttonClass("primary")}>
              <Plus className="size-4" aria-hidden />
              New {KIND[kind].one}
            </Link>
          )
        }
      />
      {done && DONE[done] && <Alert tone="success">{DONE[done]}</Alert>}
      {waiting > 0 && (
        <Alert tone="warning">
          {waiting === 1 ? "1 product change is" : `${waiting} product changes are`} waiting for approval{canApprove ? "." : " by the chairperson or principal officer."}
        </Alert>
      )}
      <LinkTabs
        label="Product type"
        current={kind}
        tabs={(["loan", "savings", "shares"] as const).map((k) => ({ key: k, label: KIND[k].label, href: `/products?kind=${k}`, count: all.filter((p) => p.kind === k && p.status !== "retired").length }))}
      />
      {shown.length === 0 && (
        <EmptyState icon={Package} title={`No ${KIND[kind].label.toLowerCase()} products yet.`}>
          {canPropose && `Propose a ${KIND[kind].one}; it goes live when another officer approves it.`}
        </EmptyState>
      )}
      <div className="flex flex-col gap-4">
        {shown.map((p) => {
          const Icon = KIND[p.kind].icon;
          const mineToDecide = canApprove && p.proposedPolicy && p.proposedBy !== ws.user.id;
          return (
            <Card key={p.id} className={p.status === "retired" ? "opacity-70" : undefined}>
              <CardBody className="flex flex-col gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="bg-accent-soft text-accent flex size-10 items-center justify-center rounded-xl">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                        {p.name}
                        <span className="text-muted font-mono text-xs font-normal">{p.code}</span>
                      </h2>
                      <p className="text-muted text-xs">
                        {p.account.code} · {p.account.name}
                        {p.version > 0 && ` · policy v${p.version}${p.approvedByName ? `, approved by ${p.approvedByName}` : ""}`}
                      </p>
                      {p.description && <p className="text-muted mt-1 text-sm">{p.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.status === "active" && (
                      <Badge tone="good" dot>
                        Active
                      </Badge>
                    )}
                    {p.status === "proposed" && (
                      <Badge tone="warning" dot>
                        Awaiting approval
                      </Badge>
                    )}
                    {p.status === "retired" && <Badge dot>Retired</Badge>}
                    {p.status === "active" && canPropose && !p.proposedPolicy && (
                      <Link href={`/products/${p.id}/edit`} className={buttonClass("secondary", undefined, "sm")}>
                        Propose change
                      </Link>
                    )}
                  </div>
                </div>
                {p.policy && <PolicyGrid kind={p.kind} policy={p.policy} />}
                {p.proposedPolicy && (
                  <div className="border-warning/30 bg-warning-soft/40 flex flex-col gap-4 rounded-xl border p-4">
                    <p className="text-sm font-medium">
                      {p.version === 0 ? "Proposed policy" : "Proposed change"} by {p.proposedBy === ws.user.id ? "you" : p.proposedByName}
                      {p.version > 0 && <span className="text-muted font-normal"> · changed terms in bold, current terms struck through</span>}
                    </p>
                    <PolicyGrid kind={p.kind} policy={p.proposedPolicy} compare={p.policy} />
                    {mineToDecide ? (
                      <DecideProductForm productId={p.id} mode="decide" />
                    ) : (
                      <p className="text-muted text-xs">
                        {p.proposedBy === ws.user.id ? "You proposed this, so another officer must approve it." : "Waiting for the chairperson or principal officer."}
                      </p>
                    )}
                  </div>
                )}
                {canApprove && p.status === "active" && !p.proposedPolicy && <DecideProductForm productId={p.id} mode="retire" />}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
