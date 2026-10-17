/**
 * Integration tests against a real PostgreSQL. They create a throwaway database,
 * apply the migrations, and check the guardrails hold even when application code
 * is bypassed. Set TEST_PG_URL to a superuser URL (any database) to run them, e.g.
 *   TEST_PG_URL=postgres://postgres@127.0.0.1:54329/postgres pnpm test
 */
import { parseNaira, type Role } from "@techvaults/core";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withSociety, type Database } from "./client.js";
import * as schema from "./schema.js";
import { listAuditEvents, verifySocietyAuditChain } from "./services/audit.js";
import { listUserSocieties } from "./services/societies.js";
import { listJournal, memberBalances, PermissionError, postJournalEntry, reverseJournalEntry, trialBalance, type Actor } from "./services/ledger.js";
import { createMember, listMembers, updateMember } from "./services/members.js";

const ADMIN = process.env.TEST_PG_URL;

/** Drizzle wraps driver errors as "Failed query: ..."; the database's own message is on `cause`. */
async function rejectsWith(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(error, "expected the operation to be rejected").toBeDefined();
  expect(`${error!.message} ${error!.cause?.message ?? ""}`).toMatch(pattern);
}
const DB_NAME = `coop_test_${process.pid}`;

describe.runIf(ADMIN)("database guardrails", () => {
  let admin: postgres.Sql;
  let app: { db: Database; close: () => Promise<void> };
  let adminDb: ReturnType<typeof drizzle<typeof schema>>;
  const ids = {} as Record<"socA" | "socB" | "treasurer" | "chair" | "auditor" | "bank" | "savings" | "shares" | "income", string>;

  const actor = (roles: Role[], userId = ids.treasurer, societyId = ids.socA): Actor => ({ userId, societyId, roles });

  beforeAll(async () => {
    const root = postgres(ADMIN!, { max: 1, onnotice: () => {} });
    await root.unsafe(`drop database if exists ${DB_NAME}`);
    await root.unsafe(`create database ${DB_NAME}`);
    await root.end();

    const url = new URL(ADMIN!);
    url.pathname = `/${DB_NAME}`;
    admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
    adminDb = drizzle(admin, { schema });
    await migrate(adminDb, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
    await admin.unsafe("alter role coop_app password 'coop_app_test_only'");

    // Seed two societies as the owner (bypasses RLS, as onboarding would).
    const [a, b] = await adminDb
      .insert(schema.societies)
      .values([
        { name: "Unilag Staff Cooperative (test)", slug: "test-a", state: "Lagos", registrar: "Lagos State Director of Co-operatives" },
        { name: "FMC Staff Cooperative (test)", slug: "test-b", state: "FCT", registrar: "FCT Director of Co-operatives" },
      ])
      .returning();
    ids.socA = a!.id;
    ids.socB = b!.id;
    const users = await adminDb
      .insert(schema.users)
      .values([
        { email: "treasurer@test", name: "Treasurer" },
        { email: "chair@test", name: "Chair" },
        { email: "auditor@test", name: "Auditor" },
      ])
      .returning();
    [ids.treasurer, ids.chair, ids.auditor] = users.map((u) => u.id) as [string, string, string];
    const accounts = await adminDb
      .insert(schema.ledgerAccounts)
      .values([
        { societyId: ids.socA, code: "1100", name: "Bank – current account", class: "asset" },
        { societyId: ids.socA, code: "2100", name: "Members' ordinary savings", class: "liability", isMemberControl: true },
        { societyId: ids.socA, code: "3100", name: "Members' share capital", class: "equity", isMemberControl: true },
        { societyId: ids.socA, code: "4100", name: "Entrance fees", class: "income" },
      ])
      .returning();
    [ids.bank, ids.savings, ids.shares, ids.income] = accounts.map((x) => x.id) as [string, string, string, string];
    await adminDb.insert(schema.members).values({ societyId: ids.socB, memberNo: "B-001", fullName: "Other Society Member" });

    url.username = "coop_app";
    url.password = "coop_app_test_only";
    app = createDb(url.toString());
  });

  afterAll(async () => {
    await app?.close();
    await admin?.end();
    const root = postgres(ADMIN!, { max: 1, onnotice: () => {} });
    await root.unsafe(`drop database if exists ${DB_NAME}`);
    await root.end();
  });

  it("isolates societies with row-level security", async () => {
    await withSociety(app.db, ids.socA, (tx) =>
      createMember(tx, actor(["secretary"]), { memberNo: "A-001", fullName: "Adaeze Okafor", staffId: "UL/2231", status: "active" }),
    );
    const seenByA = await withSociety(app.db, ids.socA, (tx) => listMembers(tx, actor(["secretary"])));
    expect(seenByA.map((m) => m.memberNo)).toEqual(["A-001"]);

    // No society in scope: nothing is visible.
    const unscoped = await app.db.select().from(schema.members);
    expect(unscoped).toEqual([]);

    // Writing into another society's data from A's scope is refused.
    await rejectsWith(
      withSociety(app.db, ids.socA, (tx) => tx.insert(schema.members).values({ societyId: ids.socB, memberNo: "X", fullName: "Smuggled" })),
      /row-level security/,
    );
  });

  it("posts a balanced entry and keeps the trial balance in balance", async () => {
    const [member] = await withSociety(app.db, ids.socA, (tx) => listMembers(tx, actor(["secretary"])));
    const posted = await withSociety(app.db, ids.socA, (tx) =>
      postJournalEntry(tx, actor(["treasurer"]), {
        entryDate: "2026-10-31",
        description: "October payroll remittance – A-001",
        idempotencyKey: "payroll-2026-10-A-001",
        lines: [
          { accountId: ids.bank, side: "debit", amount: parseNaira("15000") },
          { accountId: ids.savings, side: "credit", amount: parseNaira("10000"), memberId: member!.id },
          { accountId: ids.shares, side: "credit", amount: parseNaira("5000"), memberId: member!.id },
        ],
      }),
    );
    expect(posted.created).toBe(true);

    const tb = await withSociety(app.db, ids.socA, (tx) => trialBalance(tx));
    const debit = tb.reduce((s, r) => s + r.debit, 0n);
    const credit = tb.reduce((s, r) => s + r.credit, 0n);
    expect(debit).toBe(credit);
    expect(tb.find((r) => r.code === "1100")!.balance).toBe(parseNaira("15000"));

    const balances = await withSociety(app.db, ids.socA, (tx) => memberBalances(tx, member!.id));
    expect(balances.map((b) => [b.code, b.balance])).toEqual([
      ["2100", parseNaira("10000")],
      ["3100", parseNaira("5000")],
    ]);
  });

  it("does not post twice for the same idempotency key", async () => {
    const draft = {
      entryDate: "2026-10-31",
      description: "Entrance fee – A-001",
      idempotencyKey: "fee-A-001",
      lines: [
        { accountId: ids.bank, side: "debit" as const, amount: parseNaira("2000") },
        { accountId: ids.income, side: "credit" as const, amount: parseNaira("2000") },
      ],
    };
    const first = await withSociety(app.db, ids.socA, (tx) => postJournalEntry(tx, actor(["treasurer"]), draft));
    const retry = await withSociety(app.db, ids.socA, (tx) => postJournalEntry(tx, actor(["treasurer"]), draft));
    expect(retry).toEqual({ ...first, created: false });
    const [{ n }] = (await admin`select count(*)::int as n from journal_lines where entry_id = ${first.id}`) as unknown as [{ n: number }];
    expect(n).toBe(2);
  });

  it("rejects an unbalanced entry at commit even when the application is bypassed", async () => {
    await expect(
      withSociety(app.db, ids.socA, async (tx) => {
        const [e] = await tx
          .insert(schema.journalEntries)
          .values({ societyId: ids.socA, entryDate: "2026-10-31", description: "bad", idempotencyKey: "raw-bad", preparedBy: ids.treasurer, postedBy: ids.treasurer })
          .returning();
        await tx.insert(schema.journalLines).values([
          { societyId: ids.socA, entryId: e!.id, accountId: ids.bank, side: "debit", amount: 100n },
          { societyId: ids.socA, entryId: e!.id, accountId: ids.income, side: "credit", amount: 99n },
        ]);
      }),
    ).rejects.toThrow(/does not balance/);
  });

  it("refuses a member control line without a member", async () => {
    await rejectsWith(
      withSociety(app.db, ids.socA, (tx) =>
        postJournalEntry(tx, actor(["treasurer"]), {
          entryDate: "2026-10-31",
          description: "Savings with no member",
          idempotencyKey: "no-member",
          lines: [
            { accountId: ids.bank, side: "debit", amount: 100n as never },
            { accountId: ids.savings, side: "credit", amount: 100n as never },
          ],
        }),
      ),
      /must name a member/,
    );
  });

  it("makes posted entries and audit events append-only", async () => {
    await rejectsWith(
      withSociety(app.db, ids.socA, (tx) => tx.execute(sql`update journal_lines set amount = 1`)),
      /permission denied|append-only/,
    );
    // Even the owner, who has full privileges, is stopped by the trigger.
    await expect(admin`delete from journal_entries`).rejects.toThrow(/append-only/);
    await expect(admin`update audit_events set action = 'x'`).rejects.toThrow(/append-only/);
  });

  it("reverses an entry once, netting every account to zero", async () => {
    const [entry] = (await admin`select id from journal_entries where idempotency_key = 'fee-A-001'`) as unknown as [{ id: string }];
    await withSociety(app.db, ids.socA, (tx) =>
      reverseJournalEntry(tx, actor(["treasurer"]), entry.id, { entryDate: "2026-11-01", reason: "Fee waived by committee", idempotencyKey: "rev-fee-A-001" }),
    );
    const tb = await withSociety(app.db, ids.socA, (tx) => trialBalance(tx));
    expect(tb.find((r) => r.code === "4100")!.balance).toBe(0n);
    await expect(
      withSociety(app.db, ids.socA, (tx) =>
        reverseJournalEntry(tx, actor(["treasurer"]), entry.id, { entryDate: "2026-11-01", reason: "again", idempotencyKey: "rev-fee-A-001-b" }),
      ),
    ).rejects.toThrow();
  });

  it("enforces role permissions in services", async () => {
    await expect(
      withSociety(app.db, ids.socA, (tx) =>
        postJournalEntry(tx, actor(["auditor"], ids.auditor), {
          entryDate: "2026-10-31",
          description: "Auditor attempt",
          idempotencyKey: "auditor",
          lines: [
            { accountId: ids.bank, side: "debit", amount: parseNaira("1") },
            { accountId: ids.income, side: "credit", amount: parseNaira("1") },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("keeps a verifiable audit chain and detects tampering", async () => {
    const [member] = await withSociety(app.db, ids.socA, (tx) => listMembers(tx, actor(["secretary"])));
    await withSociety(app.db, ids.socA, (tx) => updateMember(tx, actor(["secretary"]), member!.id, { phone: "08030000000" }, "Member requested update"));
    expect(await withSociety(app.db, ids.socA, (tx) => verifySocietyAuditChain(tx, ids.socA))).toEqual({ ok: true });

    // Simulate a privileged attacker who disables the trigger and edits history.
    await admin.begin(async (t) => {
      await t`alter table audit_events disable trigger audit_events_append_only`;
      await t`update audit_events set reason = 'edited' where sequence = 1 and society_id = ${ids.socA}`;
      await t`alter table audit_events enable trigger audit_events_append_only`;
    });
    expect(await withSociety(app.db, ids.socA, (tx) => verifySocietyAuditChain(tx, ids.socA))).toMatchObject({ ok: false, brokenAtSequence: 1 });
  });

  it("lists journal entries with lines, newest first, and marks reversals", async () => {
    const journal = await withSociety(app.db, ids.socA, (tx) => listJournal(tx, actor(["treasurer"])));
    expect(journal.length).toBeGreaterThanOrEqual(3);
    expect(journal[0]!.entryNo > journal[1]!.entryNo).toBe(true);
    const fee = journal.find((e) => e.description === "Entrance fee – A-001")!;
    expect(fee.reversedByEntryId).not.toBeNull();
    expect(fee.lines.map((l) => [l.accountCode, l.side])).toEqual([
      ["1100", "debit"],
      ["4100", "credit"],
    ]);
    const events = await withSociety(app.db, ids.socA, (tx) => listAuditEvents(tx, ids.socA));
    expect(events[0]!.sequence).toBeGreaterThan(events.at(-1)!.sequence);
  });

  it("lists a user's societies without opening society_users to the app", async () => {
    await adminDb.insert(schema.societyUsers).values([
      { societyId: ids.socA, userId: ids.treasurer, roles: ["treasurer", "not_a_real_role"] },
      { societyId: ids.socB, userId: ids.chair, roles: ["chairperson"] },
    ]);
    const mine = await listUserSocieties(app.db, ids.treasurer);
    expect(mine).toEqual([{ societyId: ids.socA, societyName: "Unilag Staff Cooperative (test)", societySlug: "test-a", roles: ["treasurer"] }]);
    // Direct reads are still limited by row-level security.
    expect(await app.db.select().from(schema.societyUsers)).toEqual([]);
  });

  it("does not let the app make anyone platform staff", async () => {
    await rejectsWith(app.db.update(schema.users).set({ isPlatformStaff: true }), /permission denied/);
  });
});
