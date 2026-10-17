import { listMembers } from "@techvaults/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { AddMemberForm } from "./add-member-form";

export const metadata = { title: "Members · TechVaults Cooperative" };

const STATUS_TONE = { active: "good", applicant: "neutral", suspended: "warning", exiting: "warning", exited: "neutral", deceased: "neutral" } as const;

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "members.read")) return <EmptyState title="Your role doesn't include the member register." />;
  const { q } = await searchParams;
  const members = await inSociety(ws, (tx) => listMembers(tx, ws.actor, q ? { search: q } : {}));

  return (
    <>
      <PageHeader title="Members" description="The society's member register. Every change is recorded in the audit trail." />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-w-0 flex-col gap-3">
          <form role="search" className="flex gap-2">
            <label htmlFor="q" className="sr-only">
              Search members
            </label>
            <Input id="q" name="q" defaultValue={q} placeholder="Search by name, member no. or staff ID" />
          </form>
          {members.length === 0 ? (
            <EmptyState title={q ? `No members match “${q}”.` : "No members yet."}>{!q && "Add the first member with the form."}</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Member no.</Th>
                  <Th>Name</Th>
                  <Th>Staff ID</Th>
                  <Th>Department</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-accent-soft/40">
                    <Td className="font-mono">{m.memberNo}</Td>
                    <Td>
                      <Link href={`/members/${m.id}`} className="text-accent font-medium hover:underline">
                        {m.fullName}
                      </Link>
                    </Td>
                    <Td className="font-mono">{m.staffId ?? "—"}</Td>
                    <Td>{m.department ?? "—"}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="text-muted text-xs">{members.length} shown</p>
        </section>
        {hasPermission(ws, "members.write") && (
          <aside className="border-border bg-surface flex h-fit flex-col gap-4 rounded-lg border p-5">
            <h2 className="font-semibold">Add a member</h2>
            <AddMemberForm />
          </aside>
        )}
      </div>
    </>
  );
}
