import { can } from "@techvaults/core";
import { asc, eq, ilike, or } from "drizzle-orm";
import type { Tx } from "../client.js";
import { members } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError, type Actor } from "./ledger.js";

export type Member = typeof members.$inferSelect;
export type NewMember = Pick<Member, "memberNo" | "fullName"> &
  Partial<Pick<Member, "staffId" | "department" | "phone" | "email" | "joinedOn" | "status" | "nomineeName" | "nomineeRelationship">>;

const AUDITED_FIELDS = ["memberNo", "fullName", "staffId", "department", "phone", "email", "status", "nomineeName", "nomineeRelationship"] as const;

function snapshot(m: Partial<Member>) {
  return Object.fromEntries(AUDITED_FIELDS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]));
}

export async function listMembers(tx: Tx, actor: Actor, opts: { search?: string } = {}): Promise<Member[]> {
  if (!can(actor.roles, "members.read")) throw new PermissionError("Your role cannot view the member register");
  const term = opts.search?.trim();
  return tx
    .select()
    .from(members)
    .where(
      term
        ? or(ilike(members.fullName, `%${term}%`), ilike(members.memberNo, `%${term}%`), ilike(members.staffId, `%${term}%`))
        : undefined,
    )
    .orderBy(asc(members.memberNo));
}

export async function getMember(tx: Tx, actor: Actor, id: string): Promise<Member | undefined> {
  if (!can(actor.roles, "members.read")) throw new PermissionError("Your role cannot view the member register");
  const [row] = await tx.select().from(members).where(eq(members.id, id));
  return row;
}

export async function createMember(tx: Tx, actor: Actor, input: NewMember): Promise<Member> {
  if (!can(actor.roles, "members.write")) throw new PermissionError("Your role cannot add members");
  const [row] = await tx
    .insert(members)
    .values({ ...input, societyId: actor.societyId })
    .returning();
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "member.created",
    entityType: "member",
    entityId: row!.id,
    after: snapshot(row!),
  });
  return row!;
}

export async function updateMember(
  tx: Tx,
  actor: Actor,
  id: string,
  changes: Partial<NewMember>,
  reason: string,
): Promise<Member> {
  if (!can(actor.roles, "members.write")) throw new PermissionError("Your role cannot change member records");
  if (!reason.trim()) throw new Error("A change to a member record needs a reason");
  const [before] = await tx.select().from(members).where(eq(members.id, id)).for("update");
  if (!before) throw new Error(`Member ${id} not found`);
  const [after] = await tx.update(members).set(changes).where(eq(members.id, id)).returning();
  const changed = AUDITED_FIELDS.filter((k) => before[k] !== after![k]);
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "member.updated",
    entityType: "member",
    entityId: id,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after![k]])),
    reason,
  });
  return after!;
}
