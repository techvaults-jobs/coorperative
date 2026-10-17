import { formatNaira, type Kobo } from "@techvaults/core";
import { trialBalance } from "@techvaults/db";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Trial balance" };

const CLASS_LABEL = { asset: "Asset", liability: "Liability", equity: "Equity", income: "Income", expense: "Expense" } as const;

export default async function TrialBalancePage() {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include the ledger." />;
  const rows = await inSociety(ws, (tx) => trialBalance(tx));
  const debit = rows.reduce((s, r) => s + r.debit, 0n) as Kobo;
  const credit = rows.reduce((s, r) => s + r.credit, 0n) as Kobo;
  const balanced = debit === credit;

  return (
    <>
      <PageHeader
        title="Trial balance"
        description="Totals for every account from all posted entries."
        actions={balanced ? <Badge tone="good">Debits equal credits</Badge> : <Badge tone="danger">Out of balance</Badge>}
      />
      <Table>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Account</Th>
            <Th>Type</Th>
            <Th numeric>Debits</Th>
            <Th numeric>Credits</Th>
            <Th numeric>Balance</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.accountId}>
              <Td className="font-mono">{r.code}</Td>
              <Td>{r.name}</Td>
              <Td className="text-muted">{CLASS_LABEL[r.class]}</Td>
              <Td numeric>{formatNaira(r.debit, { symbol: false })}</Td>
              <Td numeric>{formatNaira(r.credit, { symbol: false })}</Td>
              <Td numeric className="font-semibold">
                {formatNaira(r.balance, { symbol: false })}
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <Td colSpan={3}>Total</Td>
            <Td numeric>{formatNaira(debit, { symbol: false })}</Td>
            <Td numeric>{formatNaira(credit, { symbol: false })}</Td>
            <Td />
          </tr>
        </tfoot>
      </Table>
    </>
  );
}
