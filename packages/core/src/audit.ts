/**
 * Tamper-evident audit trail.
 *
 * Each event stores the SHA-256 hash of its canonical content together with the
 * previous event's hash for the same society. Changing, removing or reordering any
 * past event breaks every hash after it, which `verifyChain` detects.
 */
import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export interface AuditEventInput {
  societyId: string | null;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string; // ISO-8601 UTC
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export interface AuditEvent extends AuditEventInput {
  sequence: number;
  prevHash: string;
  hash: string;
}

/** JSON with object keys sorted at every level, so equal content always hashes equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === "bigint") return `${v.toString()}n`;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

export function hashEvent(input: AuditEventInput, sequence: number, prevHash: string): string {
  return createHash("sha256")
    .update(prevHash)
    .update("\n")
    .update(canonicalJson({ ...input, sequence }))
    .digest("hex");
}

export function appendEvent(chain: readonly AuditEvent[], input: AuditEventInput): AuditEvent {
  const last = chain.at(-1);
  const sequence = last ? last.sequence + 1 : 1;
  const prevHash = last ? last.hash : GENESIS_HASH;
  return { ...input, sequence, prevHash, hash: hashEvent(input, sequence, prevHash) };
}

export type ChainCheck = { ok: true } | { ok: false; brokenAtSequence: number; reason: string };

export function verifyChain(chain: readonly AuditEvent[]): ChainCheck {
  let prevHash = GENESIS_HASH;
  for (const [index, event] of chain.entries()) {
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      return { ok: false, brokenAtSequence: expectedSequence, reason: "sequence gap or reorder" };
    }
    if (event.prevHash !== prevHash) {
      return { ok: false, brokenAtSequence: event.sequence, reason: "previous hash mismatch" };
    }
    const { sequence, prevHash: _p, hash, ...input } = event;
    if (hashEvent(input, sequence, prevHash) !== hash) {
      return { ok: false, brokenAtSequence: event.sequence, reason: "content does not match hash" };
    }
    prevHash = hash;
  }
  return { ok: true };
}
