import { formatNaira } from "@techvaults/core";
import { listAccounts, listMembers, listProducts, listWithdrawals } from "@techvaults/db";
import { Banknote } from "lucide-react";
import { randomUUID } from "node:crypto";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { todayIso } from "@/lib/periods";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { RequestForm, StepForm } from "./forms";

export const metadata = { title: "Withdrawals" };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Awaiting decision", tone: "info" },
  approved: { label: "Approved, to pay", tone: "accent" },
  paying: { label: "Payment awaiting approval", tone: "warning" },
  paid: { label: "Paid", tone: "good" },
  rejected: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
const TABS = [
  { key: "decide", label: "To decide", statuses: ["requested"] },
  { key: "pay", label: "To pay", statuses: ["approved", "paying"] },
  { key: "paid", label: "Paid", statuses: ["paid"] },
  { key: "closed", label: "Declined & cancelled", statuses: ["rejected", "cancelled"] },
];

export default async function WithdrawalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ws = await requireWorkspace();
  const canRequest = hasPermission(ws, "ledger.prepare") || hasPermission(ws, "members.write");
  const canDecide = hasPermission(ws, "ledger.approve");
  const canPay = hasPermission(ws, "ledger.prepare");
  if (!canRequest && !canDecide && !hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include withdrawals." />;
  const { tab: t } = await searchParams;
  const data = await inSociety(ws, async (tx) => ({
    list: await listWithdrawals(tx, ws.actor),
    members: canRequest ? (await listMembers(tx, ws.actor)).filter((m) => m.status === "active" || m.status === "exiting") : [],
    products: (await listProducts(tx, ws.actor, { kind: "savings" })).filter((p) => p.status === "active"),
    banks: canPay ? (await listAccounts(tx, ws.actor)).filter((a) => a.class === "asset" && !a.isMemberControl && a.isActive) : [],
  }));
  const tab = TABS.find((x) => x.key === (t ?? (data.list.some((w) => w.status === "requested") ? "decide" : "pay"))) ?? TABS[0]!;
  const shown = data.list.filter((w) => tab.statuses.includes(w.status));
  const today = todayIso();

  return (
    <>
      <PageHeader
        title="Withdrawals"
        description="Members taking money out of savings. Each request is checked against the product's approved rules, decided by a second officer, and paid through an approved journal entry once the notice period has passed."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <LinkTabs
            label="Stage"
            current={tab.key}
            tabs={TABS.map((x) => ({ key: x.key, label: x.label, href: `/withdrawals?tab=${x.key}`, count: data.list.filter((w) => x.statuses.includes(w.status)).length }))}
          />
          {shown.length === 0 && <EmptyState icon={Banknote} title={`Nothing in "${tab.label.toLowerCase()}".`} />}
          {shown.map((w) => (
            <Card key={w.id}>
              <CardBody className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={w.memberName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{w.memberName}</p>
                    <p className="text-muted text-xs">
                      {w.memberNo} · {w.productName} · requested {w.requestedOn} by {w.requestedByName}
                      {w.reason && ` · “${w.reason}”`}
                    </p>
                  </div>
                  <span className="text-lg font-semibold tabular-nums">{formatNaira(w.amount)}</span>
                  <Badge tone={STATUS[w.status]!.tone} dot>
                    {STATUS[w.status]!.label}
                  </Badge>
                </div>
                {w.status === "approved" && <p className="text-muted text-xs">Can be paid from {w.earliestPayment} (notice period).</p>}
                {w.decisionReason && <p className="text-muted text-xs">Reason: {w.decisionReason}</p>}
                {w.status === "requested" && canDecide && w.requestedBy !== ws.user.id && <StepForm id={w.id} mode="decide" />}
                {w.status === "requested" && w.requestedBy === ws.user.id && <p className="text-muted text-xs">You recorded this, so another officer decides it.</p>}
                {w.status === "approved" && canPay && (
                  <StepForm id={w.id} mode="pay" banks={data.banks.map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }))} paidOn={w.earliestPayment > today ? w.earliestPayment : today} idempotencyKey={randomUUID()} />
                )}
                {(w.status === "requested" || w.status === "approved") && canRequest && <StepForm id={w.id} mode="cancel" />}
              </CardBody>
            </Card>
          ))}
        </div>
        {canRequest && (
          <Card className="h-fit xl:sticky xl:top-24">
            <CardHeader title="New request" description="On behalf of a member. Members can also ask through their portal." />
            <CardBody>
              {data.products.length === 0 ? (
                <p className="text-muted text-sm">Set up an approved savings product first (Products).</p>
              ) : (
                <RequestForm
                  members={data.members.map((m) => ({ id: m.id, label: `${m.memberNo} · ${m.fullName}` }))}
                  products={data.products.map((p) => ({ id: p.id, label: p.name }))}
                />
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
