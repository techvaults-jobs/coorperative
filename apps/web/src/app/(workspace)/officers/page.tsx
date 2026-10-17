import { OFFICER_ROLES } from "@techvaults/core";
import { listOfficers, listOpenInvitations } from "@techvaults/db";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { ROLE_HINTS, roleLabel } from "@/lib/roles";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { revokeInvitationAction } from "../actions";
import { EditOfficerForm } from "./edit-officer-form";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Officers" };

const day = (d: Date) => d.toLocaleDateString("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" });

export default async function OfficersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "officers.manage")) return <EmptyState title="Your role doesn't include managing officers." />;
  const { error, notice } = await searchParams;
  const { officers, invitations } = await inSociety(ws, async (tx) => ({
    officers: await listOfficers(tx, ws.actor),
    invitations: await listOpenInvitations(tx, ws.actor),
  }));
  const roles = OFFICER_ROLES.map((r) => ({ value: r, label: roleLabel(r), hint: ROLE_HINTS[r] ?? "" }));
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Officers"
        description="People who can sign in to this society, and what each can do. Every change is recorded in the audit trail."
      />
      {notice === "removed" && (
        <Alert tone="success">Access removed. Their past work stays attributed to them in the journal and audit trail.</Alert>
      )}
      {error && (
        <Alert tone="danger">{error}</Alert>
      )}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-3" aria-labelledby="officers-heading">
            <h2 id="officers-heading" className="font-semibold">
              Current officers <span className="text-muted font-normal">({officers.length})</span>
            </h2>
            <Table>
              <thead>
                <tr>
                  <Th>Officer</Th>
                  <Th>Roles</Th>
                  <Th>Two-factor</Th>
                </tr>
              </thead>
              <tbody>
                {officers.map((o) => (
                  <tr key={o.userId}>
                    <Td>
                      <p className="font-medium">
                        {o.name}
                        {o.userId === ws.user.id && <span className="text-muted font-normal"> (you)</span>}
                      </p>
                      <p className="text-muted text-xs break-all">{o.email}</p>
                      {o.userId !== ws.user.id && <EditOfficerForm userId={o.userId} name={o.name} current={o.roles} roles={roles} />}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {o.roles.map((r) => (
                          <Badge key={r}>{roleLabel(r)}</Badge>
                        ))}
                      </div>
                    </Td>
                    <Td>{o.twoFactorEnabled ? <Badge tone="good">On</Badge> : <Badge tone="warning">Not set up</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="invitations-heading">
            <h2 id="invitations-heading" className="font-semibold">
              Open invitations <span className="text-muted font-normal">({invitations.length})</span>
            </h2>
            {invitations.length === 0 ? (
              <p className="text-muted text-sm">No invitations waiting.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Email</Th>
                    <Th>Roles</Th>
                    <Th>Expires</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((i) => (
                    <tr key={i.id}>
                      <Td>
                        <p className="break-all">{i.email}</p>
                        <p className="text-muted text-xs">
                          Invited by {i.invitedByName} on {day(i.createdAt)}
                        </p>
                      </Td>
                      <Td>{i.roles.map(roleLabel).join(", ")}</Td>
                      <Td className="whitespace-nowrap">{i.expiresAt <= now ? <Badge tone="warning">Expired</Badge> : day(i.expiresAt)}</Td>
                      <Td className="text-right">
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="invitationId" value={i.id} />
                          <Button type="submit" variant="ghost" className="h-8 px-2.5">
                            {i.expiresAt <= now ? "Remove" : "Revoke"}
                          </Button>
                        </form>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        </div>

        <aside className="border-border bg-surface flex h-fit flex-col gap-4 rounded-xl border p-5 shadow-sm xl:sticky xl:top-24">
          <div>
            <h2 className="font-semibold">Invite an officer</h2>
            <p className="text-muted text-xs">
              You get a private link to send them yourself. It works once and expires in 7 days. They set their own password and
              two-factor authentication.
            </p>
          </div>
          <InviteForm roles={roles} />
        </aside>
      </div>
    </>
  );
}
