import { listAccounts, listMembers } from "@techvaults/db";
import { randomUUID } from "node:crypto";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { PostEntryForm } from "../post-entry-form";

export const metadata = { title: "Prepare entry" };

export default async function PrepareEntryPage() {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.prepare")) return <EmptyState title="Your role can't prepare journal entries." />;
  const { accounts, members } = await inSociety(ws, async (tx) => ({
    accounts: await listAccounts(tx, ws.actor),
    members: hasPermission(ws, "members.read") ? await listMembers(tx, ws.actor) : [],
  }));
  return (
    <>
      <PageHeader
        back={{ href: "/ledger", label: "Journal" }}
        title="Prepare an entry"
        description="Add as many lines as the entry needs; debits must equal credits. Another officer approves it before it reaches the journal."
      />
      <Card className="max-w-4xl">
        <CardHeader title="Entry details" />
        <CardBody>
          <PostEntryForm
            idempotencyKey={randomUUID()}
            today={new Date().toISOString().slice(0, 10)}
            accounts={accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, label: `${a.code} · ${a.name}`, memberControl: a.isMemberControl }))}
            members={members.filter((m) => m.status === "active").map((m) => ({ id: m.id, label: `${m.memberNo} · ${m.fullName}` }))}
          />
        </CardBody>
      </Card>
    </>
  );
}
