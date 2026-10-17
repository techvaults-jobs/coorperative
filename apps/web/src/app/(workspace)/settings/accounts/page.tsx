import { formatNaira } from "@techvaults/core";
import { listChartOfAccounts, trialBalance } from "@techvaults/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ROW_HOVER, Table, Td, Th } from "@/components/ui/table";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { toggleAccount } from "../actions";
import { AddAccountForm } from "./add-account-form";

export const metadata = { title: "Chart of accounts" };

const CLASSES = [
  ["asset", "Assets"],
  ["liability", "Liabilities"],
  ["equity", "Equity"],
  ["income", "Income"],
  ["expense", "Expenses"],
] as const;

export default async function AccountsPage() {
  const ws = await requireWorkspace();
  const canEdit = hasPermission(ws, "accounts.manage");
  const { accounts, balances } = await inSociety(ws, async (tx) => ({
    accounts: await listChartOfAccounts(tx, ws.actor),
    balances: new Map((await trialBalance(tx)).map((r) => [r.accountId, r.balance])),
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        {CLASSES.map(([cls, label]) => {
          const rows = accounts.filter((a) => a.class === cls);
          if (rows.length === 0) return null;
          return (
            <section key={cls} className="flex flex-col gap-2" aria-labelledby={`h-${cls}`}>
              <h2 id={`h-${cls}`} className="text-[15px] font-semibold">
                {label} <span className="text-muted font-normal">({rows.length})</span>
              </h2>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-24">Code</Th>
                    <Th>Account</Th>
                    <Th numeric>Balance</Th>
                    <Th>Status</Th>
                    {canEdit && (
                      <Th>
                        <span className="sr-only">Actions</span>
                      </Th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className={ROW_HOVER}>
                      <Td className="font-mono text-[13px]">{a.code}</Td>
                      <Td>
                        {a.name}
                        {a.isMemberControl && (
                          <Badge tone="info" className="ml-2">
                            Member balances
                          </Badge>
                        )}
                      </Td>
                      <Td numeric>{formatNaira(balances.get(a.id) ?? (0n as never))}</Td>
                      <Td>{a.isActive ? <Badge tone="good" dot>Active</Badge> : <Badge dot>Inactive</Badge>}</Td>
                      {canEdit && (
                        <Td className="text-right">
                          <form action={toggleAccount}>
                            <input type="hidden" name="accountId" value={a.id} />
                            <input type="hidden" name="active" value={String(!a.isActive)} />
                            <Button type="submit" variant="ghost" size="sm" aria-label={`${a.isActive ? "Deactivate" : "Reactivate"} ${a.code} ${a.name}`}>
                              {a.isActive ? "Deactivate" : "Reactivate"}
                            </Button>
                          </form>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          );
        })}
      </div>
      {canEdit && (
        <Card className="h-fit xl:sticky xl:top-24">
          <CardHeader title="Add an account" description="Codes start with 1 assets, 2 liabilities, 3 equity, 4 income, 5 expenses." />
          <CardBody>
            <AddAccountForm />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
