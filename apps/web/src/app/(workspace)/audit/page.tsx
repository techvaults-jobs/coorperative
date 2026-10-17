import { listAuditEvents, verifySocietyAuditChain } from "@techvaults/db";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Audit trail" };

const ACTION_LABEL: Record<string, string> = {
  "member.created": "Member added",
  "member.updated": "Member changed",
  "journal.submitted": "Entry submitted for approval",
  "journal.reversal_requested": "Reversal requested",
  "journal.posted": "Entry approved and posted",
  "journal.reversed": "Reversal approved and posted",
  "journal.rejected": "Entry rejected",
  "journal.withdrawn": "Entry withdrawn",
  "officer.invited": "Officer invited",
  "officer.invitation_revoked": "Invitation revoked",
  "officer.invitation_replaced": "Invitation replaced",
  "officer.joined": "Officer joined",
  "officer.roles_changed": "Officer roles changed",
  "officer.removed": "Officer access removed",
};

export default async function AuditPage() {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "audit.read")) return <EmptyState title="Your role doesn't include the audit trail." />;
  const { check, events } = await inSociety(ws, async (tx) => ({
    check: await verifySocietyAuditChain(tx, ws.society.societyId),
    events: await listAuditEvents(tx, ws.society.societyId, 200),
  }));

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every change, who made it and when. Each record is chained to the one before it by a cryptographic hash."
        actions={
          check.ok ? (
            <Badge tone="good">Chain verified · {events.length > 0 ? `${events[0]!.sequence} records` : "empty"}</Badge>
          ) : (
            <Badge tone="danger">
              Broken at record {check.brokenAtSequence}: {check.reason}
            </Badge>
          )
        }
      />
      {events.length === 0 ? (
        <EmptyState title="Nothing recorded yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th numeric>#</Th>
              <Th>When (UTC)</Th>
              <Th>Who</Th>
              <Th>What</Th>
              <Th>Reason</Th>
              <Th>Hash</Th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.sequence}>
                <Td numeric>{e.sequence}</Td>
                <Td className="font-mono text-xs whitespace-nowrap">{e.occurredAt.replace("T", " ").slice(0, 19)}</Td>
                <Td>{e.actorName ?? "Unknown"}</Td>
                <Td>{ACTION_LABEL[e.action] ?? e.action}</Td>
                <Td className="text-muted">{e.reason ?? "—"}</Td>
                <Td className="text-muted font-mono text-xs" title={e.hash}>
                  {e.hash.slice(0, 10)}…
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
