import { formatNaira } from "@techvaults/core";
import { listProducts, listWithdrawals, memberBalances, withSociety } from "@techvaults/db";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePortal } from "@/lib/session";
import { requirePortalSociety } from "@/lib/society";
import { WithdrawForm } from "./withdraw-form";

export const metadata = { title: "Withdraw savings" };

const LABEL: Record<string, string> = { requested: "Being reviewed", approved: "Approved", paying: "Being paid", paid: "Paid", rejected: "Declined", cancelled: "Cancelled" };

export default async function WithdrawPage() {
  const me = await requirePortal();
  const society = await requirePortalSociety();
  if (!society.modules.includes("savings")) notFound();
  const data = await withSociety(db(), me.society.societyId, async (tx) => ({
    products: (await listProducts(tx, me.actor, { kind: "savings" })).filter((p) => p.status === "active"),
    balances: await memberBalances(tx, me.memberId),
    requests: await listWithdrawals(tx, me.actor),
  }));
  return (
    <>
      <PageHeader back={{ href: "/my", label: "Home" }} title="Withdraw savings" description="Ask to take money out of your savings. An officer reviews it, and you're paid after the product's notice period." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Your request" />
          <CardBody>
            {data.products.length === 0 ? (
              <p className="text-muted text-sm">Your society hasn&apos;t set up savings products yet.</p>
            ) : (
              <WithdrawForm
                products={data.products.map((p) => {
                  const bal = data.balances.find((b) => b.code === p.account.code);
                  const policy = p.policy as { withdrawalNoticeDays: number; withdrawable: boolean } | null;
                  return {
                    id: p.id,
                    label: `${p.name} · balance ${formatNaira(bal?.balance ?? (0n as never))}`,
                    note: policy ? (policy.withdrawable ? `${policy.withdrawalNoticeDays} days' notice` : "Only when leaving the society") : "",
                  };
                })}
              />
            )}
          </CardBody>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Your requests" />
          <ul className="divide-border mt-3 divide-y">
            {data.requests.length === 0 && <li className="text-muted px-5 pb-5 text-sm">None yet.</li>}
            {data.requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>
                  <span className="block font-medium tabular-nums">{formatNaira(r.amount)}</span>
                  <span className="text-muted text-xs">{r.requestedOn}</span>
                </span>
                <Badge tone={r.status === "paid" ? "good" : r.status === "rejected" ? "danger" : "info"}>{LABEL[r.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
