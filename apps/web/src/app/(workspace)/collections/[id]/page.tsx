import { formatNaira, kobo } from "@techvaults/core";
import { collectionSheet, listAccounts } from "@techvaults/db";
import { Check, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Table, Td, Th } from "@/components/ui/table";
import { COLLECTION_STATUS, meetingLabel } from "@/lib/collection-status";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { SheetGrid } from "./sheet-grid";
import { SubmitSheetForm } from "./submit-form";

export const metadata = { title: "Collection meeting" };

const STEPS = ["Record payments", "Count & submit", "Approve posting", "Posted"];
const naira = (k: bigint) => (Number(k) / 100).toFixed(2);

export default async function CollectionSheetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const ws = await requireWorkspace();
  const canManage = hasPermission(ws, "collections.manage");
  if (!canManage && !hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include collections." />;
  const { id } = await params;
  const { done } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canSubmit = canManage && hasPermission(ws, "ledger.prepare");
  const data = await inSociety(ws, async (tx) => {
    const sheet = await collectionSheet(tx, ws.actor, id);
    if (!sheet) return null;
    const banks = canSubmit ? (await listAccounts(tx, ws.actor)).filter((a) => a.class === "asset" && !a.isMemberControl && a.isActive) : [];
    return { sheet, banks };
  });
  if (!data) notFound();
  const { sheet, banks } = data;
  const step = sheet.status === "draft" ? 0 : sheet.status === "submitted" ? 2 : 3;
  const editable = sheet.status === "draft" && canManage;
  const contributions = sheet.columns.filter((c) => c.kind === "savings" || c.kind === "shares");
  const received = sheet.cashCounted === null ? null : kobo(sheet.cashCounted + (sheet.transfers ?? 0n));

  return (
    <>
      <PageHeader
        back={{ href: "/collections", label: "Collections" }}
        title={meetingLabel(sheet.meetingDate)}
        description={`${sheet.rows.length} members on the sheet · ${sheet.paidMembers} paid`}
        actions={
          <>
            <Link href={`/collections/${sheet.id}/print`} className={buttonClass("secondary", undefined, "sm")}>
              <Printer className="size-4" aria-hidden />
              {sheet.status === "draft" ? "Print sheet for the meeting" : "Print"}
            </Link>
            <Badge tone={COLLECTION_STATUS[sheet.status]!.tone} dot>
              {COLLECTION_STATUS[sheet.status]!.label}
            </Badge>
          </>
        }
      />
      {done === "submit" && <Alert tone="success">Posting prepared. It reaches the ledger when another officer approves it in Approvals.</Alert>}

      <ol aria-label="Progress" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
              i < step || sheet.status === "posted" ? "border-success/30 bg-success-soft text-success" : i === step ? "border-accent bg-accent-soft text-accent" : "border-border text-muted",
            )}
          >
            {i < step || sheet.status === "posted" ? <Check className="size-3.5" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}
            {label}
          </li>
        ))}
      </ol>

      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Recorded on the sheet" value={formatNaira(sheet.total)} footnote={`${sheet.paidMembers} members paid`} />
        <StatCard label="Savings & shares" value={formatNaira(kobo(contributions.reduce((s, c) => s + (sheet.totals[c.key] ?? 0n), 0n)))} footnote={contributions.map((c) => c.label).join(" · ") || "No schemes"} />
        <StatCard label="Loan repayments & interest" value={formatNaira(kobo((sheet.totals.loan ?? 0n) + (sheet.totals.interest ?? 0n)))} footnote={`Interest ${formatNaira(sheet.totals.interest ?? kobo(0))}`} />
        <StatCard
          label="Received"
          value={received === null ? "—" : formatNaira(received)}
          footnote={received === null ? "Counted when the sheet is submitted" : sheet.differenceNote ? `Difference: ${sheet.differenceNote}` : sheet.lodgementRef ? `Ref ${sheet.lodgementRef}` : "Matches the sheet"}
        />
      </section>

      {sheet.otherLoans > 0 && (
        <Alert tone="info">
          {sheet.otherLoans === 1 ? "One member has" : `${sheet.otherLoans} members have`} a second active loan. The sheet takes repayments for each member&apos;s oldest loan; record the others from the loan&apos;s page.
        </Alert>
      )}
      {contributions.length === 0 && (
        <Alert tone="warning" actions={<Link href="/products" className="font-semibold hover:underline">Products →</Link>}>
          There are no approved savings or share products, so the sheet only has loan columns.
        </Alert>
      )}

      {editable ? (
        <SheetGrid
          sheetId={sheet.id}
          columns={sheet.columns.map((c) => ({ key: c.key, label: c.label, loan: c.kind === "loan" || c.kind === "interest" }))}
          rows={sheet.rows.map((r) => ({
            memberId: r.memberId,
            memberNo: r.memberNo,
            name: r.name,
            values: Object.fromEntries(Object.entries(r.amounts).map(([k, v]) => [k, naira(v)])),
            loan: r.loan ? { loanNo: r.loan.loanNo, outstanding: formatNaira(r.loan.outstanding), interestDue: formatNaira(r.loan.interestDue) } : null,
          }))}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Card</Th>
              <Th>Name</Th>
              {sheet.columns.map((c) => (
                <Th key={c.key} numeric>
                  {c.label}
                </Th>
              ))}
              <Th numeric>Total</Th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.memberId}>
                <Td className="font-mono text-[13px]">{r.memberNo}</Td>
                <Td>
                  <Link href={`/members/${r.memberId}`} className="hover:text-accent font-medium">
                    {r.name}
                  </Link>
                </Td>
                {sheet.columns.map((c) => (
                  <Td key={c.key} numeric>
                    {r.amounts[c.key] ? formatNaira(r.amounts[c.key]!) : ""}
                  </Td>
                ))}
                <Td numeric className="font-medium">
                  {formatNaira(r.total)}
                </Td>
              </tr>
            ))}
            <tr className="bg-surface-2 font-semibold">
              <Td colSpan={2}>Totals</Td>
              {sheet.columns.map((c) => (
                <Td key={c.key} numeric>
                  {formatNaira(sheet.totals[c.key] ?? kobo(0))}
                </Td>
              ))}
              <Td numeric>{formatNaira(sheet.total)}</Td>
            </tr>
          </tbody>
        </Table>
      )}

      {sheet.status === "draft" && canSubmit && (
        <Card>
          <CardHeader
            title="Count and submit"
            description="Save the sheet first. Count the cash, add the transfers, and record the lodgement. One journal entry posts the meeting when another officer approves it."
          />
          <CardBody>
            {sheet.total === 0n ? (
              <p className="text-muted text-sm">Nothing is recorded on the sheet yet.</p>
            ) : (
              <SubmitSheetForm sheetId={sheet.id} recorded={sheet.total.toString()} banks={banks.map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }))} idempotencyKey={randomUUID()} />
            )}
          </CardBody>
        </Card>
      )}
      {sheet.status === "draft" && canManage && !canSubmit && (
        <Alert tone="info">When the sheet is complete, hand the cash and the sheet to the treasurer, who counts it and submits it for posting.</Alert>
      )}
      {sheet.status === "submitted" && (
        <Alert tone="info" actions={<Link href="/approvals" className="font-semibold hover:underline">Open approvals →</Link>}>
          The posting is waiting for another officer&apos;s approval. If it&apos;s rejected, the sheet opens again for correction.
        </Alert>
      )}
    </>
  );
}
