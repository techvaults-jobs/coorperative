import { describe, expect, it } from "vitest";
import { appendEvent, canonicalJson, GENESIS_HASH, verifyChain, type AuditEvent, type AuditEventInput } from "./audit.js";

const base: Omit<AuditEventInput, "action" | "entityId"> = {
  societyId: "soc_1",
  actorId: "usr_treasurer",
  entityType: "member",
  occurredAt: "2026-10-17T09:00:00Z",
};

function buildChain(n: number): AuditEvent[] {
  const chain: AuditEvent[] = [];
  for (let i = 0; i < n; i++) {
    chain.push(appendEvent(chain, { ...base, action: "member.updated", entityId: `M-00${i}`, after: { phone: `080${i}` } }));
  }
  return chain;
}

describe("audit chain", () => {
  it("starts from the genesis hash and links each event", () => {
    const chain = buildChain(3);
    expect(chain[0]!.prevHash).toBe(GENESIS_HASH);
    expect(chain[1]!.prevHash).toBe(chain[0]!.hash);
    expect(chain.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(verifyChain(chain)).toEqual({ ok: true });
  });

  it("detects an edited event", () => {
    const chain = buildChain(3);
    chain[1] = { ...chain[1]!, after: { phone: "tampered" } };
    expect(verifyChain(chain)).toMatchObject({ ok: false, brokenAtSequence: 2 });
  });

  it("detects a deleted event", () => {
    const chain = buildChain(3);
    chain.splice(1, 1);
    expect(verifyChain(chain)).toMatchObject({ ok: false, brokenAtSequence: 2 });
  });

  it("hashes key order independently", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("serialises bigint amounts", () => {
    expect(canonicalJson({ amount: 125050n })).toBe('{"amount":"125050n"}');
  });
});
