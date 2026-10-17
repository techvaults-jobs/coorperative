import { appendEvent, verifyChain, type AuditEvent, type AuditEventInput, type ChainCheck } from "@techvaults/core";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { auditEvents } from "../schema.js";

type Row = typeof auditEvents.$inferSelect;

function toEvent(row: Row): AuditEvent {
  return {
    societyId: row.societyId,
    actorId: row.actorId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    occurredAt: new Date(row.occurredAt).toISOString(),
    sequence: row.sequence,
    prevHash: row.prevHash,
    hash: row.hash,
    ...(row.before !== null ? { before: row.before } : {}),
    ...(row.after !== null ? { after: row.after } : {}),
    ...(row.reason !== null ? { reason: row.reason } : {}),
  };
}

/**
 * Append an audit event inside the caller's transaction. A per-society advisory lock
 * serialises writers so the hash chain never forks.
 */
export async function recordAudit(
  tx: Tx,
  input: Omit<AuditEventInput, "occurredAt" | "societyId"> & { societyId: string },
): Promise<AuditEvent> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit:${input.societyId}`}, 0))`);
  const [last] = await tx
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.societyId, input.societyId))
    .orderBy(desc(auditEvents.sequence))
    .limit(1);
  // JSON round-trip so the hashed content equals what jsonb stores and returns.
  const normalise = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))));
  const event = appendEvent(last ? [toEvent(last)] : [], {
    ...input,
    occurredAt: new Date().toISOString(),
    ...(input.before !== undefined ? { before: normalise(input.before) } : {}),
    ...(input.after !== undefined ? { after: normalise(input.after) } : {}),
  });
  await tx.insert(auditEvents).values({
    societyId: input.societyId,
    sequence: event.sequence,
    actorId: event.actorId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    occurredAt: event.occurredAt,
    before: event.before ?? null,
    after: event.after ?? null,
    reason: event.reason ?? null,
    prevHash: event.prevHash,
    hash: event.hash,
  });
  return event;
}

export async function verifySocietyAuditChain(tx: Tx, societyId: string): Promise<ChainCheck> {
  const rows = await tx.select().from(auditEvents).where(eq(auditEvents.societyId, societyId)).orderBy(asc(auditEvents.sequence));
  return verifyChain(rows.map(toEvent));
}
