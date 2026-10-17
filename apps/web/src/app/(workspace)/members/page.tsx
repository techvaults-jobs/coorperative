import { listMembers } from "@techvaults/db";
import { Search, Upload, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MEMBER_STATUS } from "@/lib/member-status";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { ROW_HOVER, Table, Td, Th } from "@/components/ui/table";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

export const metadata = { title: "Members" };


export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "members.read")) return <EmptyState title="Your role doesn't include the member register." />;
  const { q, status = "all" } = await searchParams;
  const { terminology: terms } = await requireSociety();
  const all = await inSociety(ws, (tx) => listMembers(tx, ws.actor, q ? { search: q } : {}));
  const members = status === "all" ? all : all.filter((m) => m.status === status);
  const count = (s: string) => all.filter((m) => m.status === s).length;
  const href = (s: string) => `/members?${new URLSearchParams({ ...(q ? { q } : {}), ...(s !== "all" ? { status: s } : {}) })}`;
  const tabs = [
    { key: "all", label: "All", count: all.length, href: href("all") },
    ...["active", "applicant", "suspended", "exiting", "exited"].filter((s) => s === "active" || count(s) > 0).map((s) => ({ key: s, label: MEMBER_STATUS[s]!.label, count: count(s), href: href(s) })),
  ];

  return (
    <>
      <PageHeader
        title="Members"
        description="The society's member register. Every change is recorded in the audit trail."
        actions={
          hasPermission(ws, "members.write") && (
            <>
              <Link href="/members/import" className={buttonClass("secondary")}>
                <Upload className="size-4" aria-hidden />
                Import
              </Link>
              <Link href="/members/new" className={buttonClass("primary")}>
                <UserPlus className="size-4" aria-hidden />
                Add member
              </Link>
            </>
          )
        }
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <LinkTabs label="Filter by status" tabs={tabs} current={status} />
          <form role="search" className="relative w-full lg:w-80">
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <Search className="text-subtle pointer-events-none absolute top-3 left-3 size-4" aria-hidden />
            <label htmlFor="q" className="sr-only">
              Search members
            </label>
            <Input id="q" name="q" defaultValue={q} placeholder={`Name, member no. or ${terms.externalId.toLowerCase()}`} className="pl-9" />
          </form>
        </div>
        {members.length === 0 ? (
          <EmptyState icon={Users} title={q ? `No members match “${q}”.` : "No members here yet."}>
            {!q && hasPermission(ws, "members.write") && "Add the first member to start the register."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Member no.</Th>
                <Th className="hidden md:table-cell">{terms.externalId}</Th>
                <Th className="hidden lg:table-cell">{terms.group}</Th>
                <Th className="hidden sm:table-cell">Joined</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={ROW_HOVER}>
                  <Td>
                    <Link href={`/members/${m.id}`} className="group flex items-center gap-3">
                      <Avatar name={m.fullName} size="sm" />
                      <span className="min-w-0">
                        <span className="group-hover:text-accent block truncate font-medium">{m.fullName}</span>
                        {m.email && <span className="text-muted block truncate text-xs">{m.email}</span>}
                      </span>
                    </Link>
                  </Td>
                  <Td className="font-mono text-[13px]">{m.memberNo}</Td>
                  <Td className="hidden font-mono text-[13px] md:table-cell">{m.staffId ?? "—"}</Td>
                  <Td className="text-muted hidden lg:table-cell">{m.department ?? "—"}</Td>
                  <Td className="text-muted hidden whitespace-nowrap sm:table-cell">{m.joinedOn ?? "—"}</Td>
                  <Td>
                    <Badge tone={MEMBER_STATUS[m.status]?.tone} dot>
                      {MEMBER_STATUS[m.status]?.label ?? m.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="text-muted text-xs">
          Showing {members.length.toLocaleString("en-NG")} of {all.length.toLocaleString("en-NG")}
        </p>
      </div>
    </>
  );
}
