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
import {
  approveSubmission,
  listJournal,
  listSubmissions,
  memberBalances,
  PermissionError,
  rejectSubmission,
  requestReversal,
  submitJournalEntry,
  trialBalance,
  withdrawSubmission,
  type Actor,
} from "./services/ledger.js";
import { createMember, listMembers, updateMember } from "./services/members.js";
import { memberCounts, monthlyFlows } from "./services/reports.js";
import { createAccount, getSocietySettings, setAccountActive, updateSocietySettings } from "./services/settings.js";
import {
  acceptInvitation,
  changeOfficerRoles,
  findInvitation,
  inviteOfficer,
  listOfficers,
  removeOfficer,
  revokeInvitation,
} from "./services/officers.js";

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
  const treasurer = () => actor(["treasurer"]);
  const chair = () => actor(["chairperson"], ids.chair);
  type Draft = Parameters<typeof submitJournalEntry>[2];

  /** Prepare as the treasurer, approve as the chair: the only way anything reaches the journal. */
  async function post(draft: Draft) {
    const submission = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), draft));
    const entry = await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, chair(), submission.id));
    return { submission, entry };
  }
  const fee = (key: string, naira = "2000"): Draft => ({
    entryDate: "2026-10-31",
    description: `Entrance fee – ${key}`,
    idempotencyKey: key,
    lines: [
      { accountId: ids.bank, side: "debit", amount: parseNaira(naira) },
      { accountId: ids.income, side: "credit", amount: parseNaira(naira) },
    ],
  });

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
    const { submission, entry } = await post({
      entryDate: "2026-10-31",
      description: "October payroll remittance – A-001",
      idempotencyKey: "payroll-2026-10-A-001",
      lines: [
        { accountId: ids.bank, side: "debit", amount: parseNaira("15000") },
        { accountId: ids.savings, side: "credit", amount: parseNaira("10000"), memberId: member!.id },
        { accountId: ids.shares, side: "credit", amount: parseNaira("5000"), memberId: member!.id },
      ],
    });
    expect(submission.created).toBe(true);
    expect(entry.entryNo).toBe(1n);

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

  it("does not submit twice for the same idempotency key, and approval posts once", async () => {
    const draft = fee("fee-A-001");
    const first = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), draft));
    const retry = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), draft));
    expect(retry).toEqual({ ...first, created: false });
    const entry = await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, chair(), first.id));
    await expect(withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, chair(), first.id))).rejects.toThrow(/already approved/);
    const [{ n }] = (await admin`select count(*)::int as n from journal_lines where entry_id = ${entry.id}`) as unknown as [{ n: number }];
    expect(n).toBe(2);
  });

  it("never lets the preparer approve their own entry, whatever their roles", async () => {
    const both = actor(["treasurer", "chairperson"]);
    const s = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, both, fee("self-approve")));
    await expect(withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, both, s.id))).rejects.toThrow(/cannot also approve/);
    await expect(withSociety(app.db, ids.socA, (tx) => rejectSubmission(tx, both, s.id, "no"))).rejects.toThrow(/cannot also approve/);
    // An approver role is still needed.
    await expect(withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, actor(["auditor"], ids.auditor), s.id))).rejects.toBeInstanceOf(PermissionError);
    await withSociety(app.db, ids.socA, (tx) => withdrawSubmission(tx, both, s.id));
  });

  it("enforces maker-checker in the database even when the application is bypassed", async () => {
    // No submission at all.
    await rejectsWith(
      withSociety(app.db, ids.socA, (tx) =>
        tx.insert(schema.journalEntries).values({ societyId: ids.socA, entryDate: "2026-10-31", description: "raw", idempotencyKey: "raw-1", preparedBy: ids.treasurer, postedBy: ids.chair }),
      ),
      /only by approving a submission/,
    );
    // A submission marked approved by its own preparer.
    const s = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), fee("raw-self")));
    await rejectsWith(
      withSociety(app.db, ids.socA, (tx) =>
        tx.update(schema.journalSubmissions).set({ status: "approved", decidedBy: ids.treasurer, decidedAt: new Date() }).where(sql`id = ${s.id}`),
      ),
      /separation_of_duties/,
    );
    // Approved, but the entry never posted: refused at commit.
    await rejectsWith(
      withSociety(app.db, ids.socA, (tx) =>
        tx.update(schema.journalSubmissions).set({ status: "approved", decidedBy: ids.chair, decidedAt: new Date() }).where(sql`id = ${s.id}`),
      ),
      /approved without posting/,
    );
    // A submission's content can't be edited, even by the owner.
    await expect(admin`update journal_submissions set description = 'edited' where id = ${s.id}`).rejects.toThrow(/cannot be edited/);
    await expect(admin`delete from journal_submissions where id = ${s.id}`).rejects.toThrow(/kept for the audit trail/);
  });

  it("numbers entries per society with no gaps, whatever is rejected or retried", async () => {
    const before = await withSociety(app.db, ids.socA, (tx) => listJournal(tx, treasurer()));
    const rejected = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), fee("gap-rejected")));
    await withSociety(app.db, ids.socA, (tx) => rejectSubmission(tx, chair(), rejected.id, "Wrong amount"));
    await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), fee("gap-rejected"))); // retry of a decided key
    const { entry } = await post(fee("gap-next"));
    expect(entry.entryNo).toBe(before[0]!.entryNo + 1n);

    const all = (await admin`select society_id, entry_no from journal_entries order by society_id, entry_no`) as unknown as { society_id: string; entry_no: string }[];
    const numbers = all.filter((r) => r.society_id === ids.socA).map((r) => Number(r.entry_no));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));

    const history = await withSociety(app.db, ids.socA, (tx) => listSubmissions(tx, chair()));
    const decided = history.find((h) => h.id === rejected.id)!;
    expect(decided).toMatchObject({ status: "rejected", decisionReason: "Wrong amount", decidedByName: "Chair", entryNo: null });
  });

  it("refuses at submission a line on the wrong kind of account", async () => {
    await expect(
      withSociety(app.db, ids.socA, (tx) =>
        submitJournalEntry(tx, treasurer(), {
          ...fee("wrong-kind"),
          lines: [
            { accountId: ids.bank, side: "debit", amount: parseNaira("1") },
            { accountId: ids.savings, side: "credit", amount: parseNaira("1") },
          ],
        }),
      ),
    ).rejects.toThrow(/must name a member/);
  });

  it("rejects an unbalanced entry at commit even when the application is bypassed", async () => {
    const s = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), fee("raw-bad")));
    await expect(
      withSociety(app.db, ids.socA, async (tx) => {
        await tx.update(schema.journalSubmissions).set({ status: "approved", decidedBy: ids.chair, decidedAt: new Date() }).where(sql`id = ${s.id}`);
        const [e] = await tx
          .insert(schema.journalEntries)
          .values({ societyId: ids.socA, entryDate: "2026-10-31", description: "Entrance fee – raw-bad", idempotencyKey: "raw-bad", submissionId: s.id, preparedBy: ids.treasurer, postedBy: ids.chair })
          .returning();
        await tx.insert(schema.journalLines).values([
          { societyId: ids.socA, entryId: e!.id, accountId: ids.bank, side: "debit", amount: 100n },
          { societyId: ids.socA, entryId: e!.id, accountId: ids.income, side: "credit", amount: 99n },
        ]);
      }),
    ).rejects.toThrow(/does not balance/);
  });

  it("refuses a member control line without a member even when the application is bypassed", async () => {
    const s = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), fee("raw-no-member")));
    await rejectsWith(
      withSociety(app.db, ids.socA, async (tx) => {
        await tx.update(schema.journalSubmissions).set({ status: "approved", decidedBy: ids.chair, decidedAt: new Date() }).where(sql`id = ${s.id}`);
        const [e] = await tx
          .insert(schema.journalEntries)
          .values({ societyId: ids.socA, entryDate: "2026-10-31", description: "Entrance fee – raw-no-member", idempotencyKey: "raw-no-member", submissionId: s.id, preparedBy: ids.treasurer, postedBy: ids.chair })
          .returning();
        await tx.insert(schema.journalLines).values([
          { societyId: ids.socA, entryId: e!.id, accountId: ids.bank, side: "debit", amount: 100n },
          { societyId: ids.socA, entryId: e!.id, accountId: ids.savings, side: "credit", amount: 100n },
        ]);
      }),
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

  it("reverses an entry once, after approval, netting every account to zero", async () => {
    const [entry] = (await admin`select id, entry_no from journal_entries where idempotency_key = 'fee-A-001'`) as unknown as [{ id: string; entry_no: string }];
    const request = (key: string) =>
      withSociety(app.db, ids.socA, (tx) => requestReversal(tx, treasurer(), entry.id, { entryDate: "2026-11-01", reason: "Fee waived by committee", idempotencyKey: key }));
    const first = await request("rev-fee-A-001");
    await expect(request("rev-fee-A-001-b")).rejects.toThrow(/already waiting for approval/);
    let tb = await withSociety(app.db, ids.socA, (tx) => trialBalance(tx));
    expect(tb.find((r) => r.code === "4100")!.balance).not.toBe(0n); // nothing posted yet

    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, chair(), first.id));
    tb = await withSociety(app.db, ids.socA, (tx) => trialBalance(tx));
    const fees = (await admin`select count(*)::int as n from journal_entries where description like 'Entrance fee%'`) as unknown as [{ n: number }];
    expect(tb.find((r) => r.code === "4100")!.balance).toBe(parseNaira("2000") * BigInt(fees[0].n - 1));
    const [reversal] = (await admin`select description from journal_entries where reverses_entry_id = ${entry.id}`) as unknown as [{ description: string }];
    expect(reversal.description).toBe(`Reversal of #${entry.entry_no}: Fee waived by committee`);
    await expect(request("rev-fee-A-001-c")).rejects.toThrow(/already been reversed/);
  });

  it("enforces role permissions in services", async () => {
    await expect(
      withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, actor(["auditor"], ids.auditor), fee("auditor", "1"))),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, actor(["chairperson"], ids.chair), fee("chair-prepares", "1"))),
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
    expect(journal[0]!.preparedByName).toBe("Treasurer");
    expect(journal[0]!.postedByName).toBe("Chair");
    expect(journal.length).toBeGreaterThanOrEqual(3);
    expect(journal[0]!.entryNo > journal[1]!.entryNo).toBe(true);
    const fee = journal.find((e) => e.description === "Entrance fee – fee-A-001")!;
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

  it("invites an officer by link, once, for the invited email only", async () => {
    const secretary = actor(["secretary"], ids.treasurer);
    await expect(withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, treasurer(), { email: "x@example.ng", roles: ["auditor"] }))).rejects.toBeInstanceOf(
      PermissionError,
    );
    await expect(withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: "x@example.ng", roles: ["member"] }))).rejects.toThrow(/Unknown role/);

    const old = await withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: " New.Officer@Example.ng ", roles: ["auditor"] }));
    const invite = await withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: "new.officer@example.ng", roles: ["auditor", "loan_officer"] }));
    expect(await findInvitation(app.db, old.token)).toEqual({ status: "revoked" }); // replaced by the newer link
    const found = await findInvitation(app.db, invite.token);
    expect(found).toMatchObject({ status: "valid", email: "new.officer@example.ng", roles: ["loan_officer", "auditor"], societyName: "Unilag Staff Cooperative (test)" });
    expect(await findInvitation(app.db, "x".repeat(43))).toEqual({ status: "not_found" });
    // The token itself is never stored.
    expect(JSON.stringify(await admin`select * from officer_invitations`)).not.toContain(invite.token);
    expect(JSON.stringify(await admin`select * from audit_events`)).not.toContain(invite.token);

    if (found.status !== "valid") throw new Error("unreachable");
    const [newUser] = await adminDb.insert(schema.users).values({ email: "new.officer@example.ng", name: "New Officer" }).returning();
    await expect(withSociety(app.db, ids.socA, (tx) => acceptInvitation(tx, found.id, { id: ids.auditor, email: "auditor@test" }))).rejects.toThrow(
      /for new\.officer@example\.ng/,
    );
    await withSociety(app.db, ids.socA, (tx) => acceptInvitation(tx, found.id, { id: newUser!.id, email: "New.Officer@example.ng" }));
    expect(await findInvitation(app.db, invite.token)).toEqual({ status: "used" });
    expect((await listUserSocieties(app.db, newUser!.id)).map((s) => s.roles)).toEqual([["loan_officer", "auditor"]]);
    await expect(withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: "new.officer@example.ng", roles: ["auditor"] }))).rejects.toThrow(
      /already an officer/,
    );
  });

  it("expires and revokes invitations", async () => {
    const secretary = actor(["secretary"], ids.treasurer);
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const stale = await withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: "late@example.ng", roles: ["auditor"] }, past));
    expect(await findInvitation(app.db, stale.token)).toEqual({ status: "expired" });
    const fresh = await withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: "late@example.ng", roles: ["auditor"] }));
    await withSociety(app.db, ids.socA, (tx) => revokeInvitation(tx, secretary, fresh.invitationId));
    expect(await findInvitation(app.db, fresh.token)).toEqual({ status: "revoked" });
    await expect(withSociety(app.db, ids.socA, (tx) => revokeInvitation(tx, secretary, fresh.invitationId))).rejects.toThrow(/already used or withdrawn/);
  });

  it("changes and removes officers, but never the manager's own access", async () => {
    const secretary = actor(["secretary"], ids.treasurer);
    const officers = await withSociety(app.db, ids.socA, (tx) => listOfficers(tx, secretary));
    const newcomer = officers.find((o) => o.email === "new.officer@example.ng")!;
    await withSociety(app.db, ids.socA, (tx) => changeOfficerRoles(tx, secretary, newcomer.userId, ["auditor"], "Moved to audit only"));
    expect((await listUserSocieties(app.db, newcomer.userId))[0]!.roles).toEqual(["auditor"]);
    await expect(withSociety(app.db, ids.socA, (tx) => changeOfficerRoles(tx, secretary, ids.treasurer, ["chairperson"], "promote me"))).rejects.toThrow(
      /your own roles/,
    );
    await expect(withSociety(app.db, ids.socA, (tx) => removeOfficer(tx, secretary, ids.treasurer, "leaving"))).rejects.toThrow(/remove yourself/);
    // Another society's officers are out of reach.
    await expect(withSociety(app.db, ids.socA, (tx) => removeOfficer(tx, secretary, ids.chair, "not ours"))).rejects.toThrow(/not an officer/);
    await withSociety(app.db, ids.socA, (tx) => removeOfficer(tx, secretary, newcomer.userId, "Left the society"));
    expect(await listUserSocieties(app.db, newcomer.userId)).toEqual([]);
    const events = await withSociety(app.db, ids.socA, (tx) => listAuditEvents(tx, ids.socA));
    expect(events.slice(0, 2).map((e) => e.action)).toEqual(["officer.removed", "officer.roles_changed"]);
    expect(await withSociety(app.db, ids.socA, (tx) => verifySocietyAuditChain(tx, ids.socA))).toMatchObject({ ok: false }); // tampered earlier in this suite
  });

  it("reports monthly flows from posted entries, ignoring reversed pairs", async () => {
    const flows = await withSociety(app.db, ids.socA, (tx) => monthlyFlows(tx, treasurer(), { months: 3, asOf: "2026-11-15" }));
    expect(flows.map((f) => f.month)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    // October: the A-001 payroll remittance credited ₦10,000 savings + ₦5,000 shares to the member.
    expect(flows[1]!.contributions).toBe(parseNaira("15000"));
    expect(flows[2]!.contributions).toBe(0n);
    const counts = await withSociety(app.db, ids.socA, (tx) => memberCounts(tx, actor(["secretary"])));
    expect(counts).toEqual({ total: 1, byStatus: { active: 1 } });
    await expect(withSociety(app.db, ids.socA, (tx) => monthlyFlows(tx, actor(["secretary"])))).rejects.toBeInstanceOf(PermissionError);
  });

  it("configures a society by sector, words, colour and modules, with an audit diff", async () => {
    const secretary = actor(["secretary"]);
    const start = await withSociety(app.db, ids.socA, (tx) => getSocietySettings(tx, treasurer()));
    expect(start).toMatchObject({ sector: "workplace", terminology: { externalId: "Staff ID" }, modulesCustomised: false });

    const after = await withSociety(app.db, ids.socA, (tx) =>
      updateSocietySettings(tx, secretary, { sector: "agricultural", terminology: { group: "Village" }, brandColor: "#1D5FAE", modules: ["savings", "loans"] }),
    );
    expect(after).toMatchObject({
      sector: "agricultural",
      brandColor: "#1d5fae",
      terminology: { externalId: "Farmer ID", group: "Village", contribution: "Contribution" },
      modules: ["savings", "loans"],
      modulesCustomised: true,
    });
    await expect(withSociety(app.db, ids.socA, (tx) => updateSocietySettings(tx, secretary, { brandColor: "#ffee00" }))).rejects.toThrow(/too light/);
    await expect(withSociety(app.db, ids.socA, (tx) => updateSocietySettings(tx, treasurer(), { name: "Hijack" }))).rejects.toBeInstanceOf(PermissionError);
    // The database refuses a malformed colour even if the app is bypassed.
    await rejectsWith(withSociety(app.db, ids.socA, (tx) => tx.execute(sql`update societies set brand_color = 'red'`)), /societies_brand_color/);

    const reset = await withSociety(app.db, ids.socA, (tx) => updateSocietySettings(tx, secretary, { modules: null }));
    expect(reset.modules).toEqual(["savings", "shares", "loans", "levies"]); // agricultural defaults
    const [event] = await withSociety(app.db, ids.socA, (tx) => listAuditEvents(tx, ids.socA, 1));
    expect(event).toMatchObject({ action: "society.settings_changed", before: { modules: ["savings", "loans"] }, after: { modules: null } });
    // Society B is untouched.
    const [b] = (await admin`select sector, brand_color from societies where id = ${ids.socB}`) as unknown as [{ sector: string; brand_color: string | null }];
    expect(b).toEqual({ sector: "workplace", brand_color: null });
  });

  it("manages the chart of accounts; inactive accounts can't take new entries", async () => {
    const account = await withSociety(app.db, ids.socA, (tx) => createAccount(tx, treasurer(), { code: "5300", name: "Meeting expenses", class: "expense" }));
    await expect(withSociety(app.db, ids.socA, (tx) => createAccount(tx, treasurer(), { code: "5300", name: "Duplicate", class: "expense" }))).rejects.toThrow(/already in use/);
    await expect(withSociety(app.db, ids.socA, (tx) => createAccount(tx, treasurer(), { code: "1500", name: "Wrong class", class: "income" }))).rejects.toThrow(/asset accounts/);
    await expect(withSociety(app.db, ids.socA, (tx) => createAccount(tx, actor(["secretary"]), { code: "5400", name: "Nope", class: "expense" }))).rejects.toBeInstanceOf(PermissionError);
    await withSociety(app.db, ids.socA, (tx) => setAccountActive(tx, treasurer(), account.id, false));
    await expect(
      withSociety(app.db, ids.socA, (tx) =>
        submitJournalEntry(tx, treasurer(), {
          ...fee("inactive-account"),
          lines: [
            { accountId: account.id, side: "debit", amount: parseNaira("1") },
            { accountId: ids.bank, side: "credit", amount: parseNaira("1") },
          ],
        }),
      ),
    ).rejects.toThrow(/active accounts/);
  });
});
