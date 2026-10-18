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
import { createSociety, listPlatformSocieties } from "./services/platform.js";
import { lastCompletedYear, previewYearEnd, submitYearEnd } from "./services/yearend.js";
import { decideWithdrawal, listWithdrawals, payWithdrawal, requestWithdrawal } from "./services/withdrawals.js";
import { importMembers, previewLegacyLoans, previewMemberImport, previewOpeningBalances, submitLegacyLoans, submitOpeningBalances } from "./services/importing.js";
import { financialPosition, incomeStatement, memberCounts, memberStatement, monthlyFlows } from "./services/reports.js";
import { createAccount, getSocietySettings, setAccountActive, updateSocietySettings } from "./services/settings.js";
import { approveProductPolicy, listProducts, proposePolicyChange, proposeProduct } from "./services/products.js";
import { applyForLoan, decideLoan, disburseLoan, getLoan, listLoans, loanAging, loanEligibility, loanPosition, recordRepayment } from "./services/loans.js";
import { DEFAULT_LOAN_POLICY, DEFAULT_SAVINGS_POLICY, DEFAULT_SHARES_POLICY, kobo } from "@techvaults/core";
import {
  createPayrollRun,
  importRemittance,
  issuePayrollRun,
  payrollReconciliation,
  payrollSchedule,
  setContribution,
  submitPayrollRun,
} from "./services/payroll.js";
import {
  acceptInvitation,
  changeOfficerRoles,
  findInvitation,
  inviteMember,
  inviteOfficer,
  listRoleGrantRequests,
  decideRoleGrant,
  listOfficers,
  listOpenInvitations,
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
    expect(mine).toEqual([{ societyId: ids.socA, societyName: "Unilag Staff Cooperative (test)", societySlug: "test-a", roles: ["treasurer"], memberId: null }]);
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

  it("needs a second officer before anyone gets approval rights", async () => {
    const secretary = actor(["secretary"], ids.treasurer);
    // With no one else able to approve, a society's first officers get their roles straight away.
    const first = await withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: "first.chair@example.ng", roles: ["chairperson"] }));
    expect(first.needsApproval).toBe(false);
    await withSociety(app.db, ids.socA, (tx) => revokeInvitation(tx, secretary, first.invitationId));

    const [approver, clerk] = await adminDb
      .insert(schema.users)
      .values([{ email: "approver@example.ng", name: "Second Approver" }, { email: "clerk@example.ng", name: "Clerk" }])
      .returning();
    await adminDb.insert(schema.societyUsers).values([
      { societyId: ids.socA, userId: approver!.id, roles: ["chairperson"] },
      { societyId: ids.socA, userId: clerk!.id, roles: ["auditor"] },
    ]);
    // Only an approver who can sign in counts.
    expect((await withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: "first.chair@example.ng", roles: ["chairperson"] }))).needsApproval).toBe(false);
    await adminDb.insert(schema.accounts).values({ userId: approver!.id, accountId: approver!.id, providerId: "credential" });
    const chairA = actor(["chairperson"], approver!.id);

    // An invitation with approval rights waits; one without doesn't.
    expect((await withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: "viewer@example.ng", roles: ["auditor"] }))).needsApproval).toBe(false);
    const invite = await withSociety(app.db, ids.socA, (tx) => inviteOfficer(tx, secretary, { email: "committee@example.ng", roles: ["loan_committee"] }));
    expect(invite.needsApproval).toBe(true);
    expect(await findInvitation(app.db, invite.token)).toEqual({ status: "awaiting_approval" });
    await expect(
      withSociety(app.db, ids.socA, (tx) => acceptInvitation(tx, invite.invitationId, { id: clerk!.id, email: "committee@example.ng" })),
    ).rejects.toThrow(/second officer/);

    const [request] = await withSociety(app.db, ids.socA, (tx) => listRoleGrantRequests(tx, secretary));
    expect(request).toMatchObject({ kind: "invitation", who: "committee@example.ng", roles: ["loan_committee"] });
    await expect(withSociety(app.db, ids.socA, (tx) => decideRoleGrant(tx, secretary, request!.id, "approve"))).rejects.toThrow(/asked for this role/);
    await expect(withSociety(app.db, ids.socA, (tx) => decideRoleGrant(tx, actor(["treasurer"], clerk!.id), request!.id, "approve"))).rejects.toBeInstanceOf(
      PermissionError,
    );
    await withSociety(app.db, ids.socA, (tx) => decideRoleGrant(tx, chairA, request!.id, "approve"));
    expect(await findInvitation(app.db, invite.token)).toMatchObject({ status: "valid", roles: ["loan_committee"] });
    await expect(withSociety(app.db, ids.socA, (tx) => decideRoleGrant(tx, chairA, request!.id, "reject"))).rejects.toThrow(/already decided/);

    // Raising an officer's roles waits too; the target can't approve their own.
    expect(await withSociety(app.db, ids.socA, (tx) => changeOfficerRoles(tx, secretary, clerk!.id, ["auditor", "loan_committee"], "Joins the committee"))).toEqual({
      pending: true,
    });
    expect((await listUserSocieties(app.db, clerk!.id))[0]!.roles).toEqual(["auditor"]);
    const [change] = await withSociety(app.db, ids.socA, (tx) => listRoleGrantRequests(tx, secretary));
    expect(change).toMatchObject({ kind: "change", who: "Clerk", reason: "Joins the committee" });
    await expect(withSociety(app.db, ids.socA, (tx) => decideRoleGrant(tx, actor(["chairperson"], clerk!.id), change!.id, "approve"))).rejects.toThrow(/yourself/);
    await withSociety(app.db, ids.socA, (tx) => decideRoleGrant(tx, chairA, change!.id, "reject", "Not yet"));
    expect((await listUserSocieties(app.db, clerk!.id))[0]!.roles).toEqual(["auditor"]);

    await withSociety(app.db, ids.socA, (tx) => changeOfficerRoles(tx, secretary, clerk!.id, ["auditor", "loan_committee"], "Committee vote passed"));
    const [again] = await withSociety(app.db, ids.socA, (tx) => listRoleGrantRequests(tx, secretary));
    await withSociety(app.db, ids.socA, (tx) => decideRoleGrant(tx, chairA, again!.id, "approve"));
    expect((await listUserSocieties(app.db, clerk!.id))[0]!.roles).toEqual(["loan_committee", "auditor"]);
    // Removing approval rights needs no second officer.
    expect(await withSociety(app.db, ids.socA, (tx) => changeOfficerRoles(tx, secretary, clerk!.id, ["auditor"], "Left the committee"))).toEqual({ pending: false });

    // The separation holds in the database as well.
    await rejectsWith(
      admin`update role_grant_requests set status = 'approved', decided_by = requested_by, decided_at = now() where id = ${change!.id}`,
      /role_grant_requests/,
    );
    const actions = (await withSociety(app.db, ids.socA, (tx) => listAuditEvents(tx, ids.socA))).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["officer.role_grant_approved", "officer.role_grant_rejected", "officer.roles_change_requested"]));
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

  it("runs a loan from product approval to closure, with maker-checker at every step", async () => {
    const secretary = actor(["secretary"], ids.treasurer);
    const committee = actor(["chairperson"], ids.chair);
    const loanAcct = await withSociety(app.db, ids.socA, (tx) => createAccount(tx, treasurer(), { code: "1300", name: "Members' loans", class: "asset", isMemberControl: true }));
    const interestAcct = await withSociety(app.db, ids.socA, (tx) => createAccount(tx, treasurer(), { code: "4200", name: "Interest on loans", class: "income" }));
    const policy = { ...DEFAULT_LOAN_POLICY, minMembershipMonths: 0, savingsMultiple: 3, guarantorsRequired: 1, minAmount: parseNaira("5000"), maxAmount: parseNaira("500000"), minTermMonths: 1 };

    // Product: proposed by one officer, approved by another.
    const productId = await withSociety(app.db, ids.socA, (tx) =>
      proposeProduct(tx, secretary, { kind: "loan", code: "reg-loan", name: "Regular loan", accountId: loanAcct.id, incomeAccountId: interestAcct.id, policy }),
    );
    await expect(withSociety(app.db, ids.socA, (tx) => approveProductPolicy(tx, actor(["secretary", "chairperson"], ids.treasurer), productId))).rejects.toThrow(/proposed this cannot/);
    await withSociety(app.db, ids.socA, (tx) => approveProductPolicy(tx, committee, productId));
    const [product] = await withSociety(app.db, ids.socA, (tx) => listProducts(tx, treasurer(), { kind: "loan" }));
    expect(product).toMatchObject({ code: "REG-LOAN", status: "active", version: 1 });

    const [borrower] = await withSociety(app.db, ids.socA, (tx) => listMembers(tx, actor(["secretary"])));
    const guarantor = await withSociety(app.db, ids.socA, (tx) => createMember(tx, actor(["secretary"]), { memberNo: "A-002", fullName: "Guarantor Member", status: "active" }));

    // Eligibility: savings ₦10,000 × 3 = ₦30,000 limit.
    const preview = await withSociety(app.db, ids.socA, (tx) => loanEligibility(tx, treasurer(), { memberId: borrower!.id, productId, amount: parseNaira("50000"), termMonths: 4, guarantors: 1 }));
    expect(preview.eligible).toBe(false);
    expect(preview.savings).toBe(parseNaira("10000"));
    await expect(
      withSociety(app.db, ids.socA, (tx) => applyForLoan(tx, treasurer(), { memberId: borrower!.id, productId, amount: parseNaira("50000"), termMonths: 4, purpose: "School fees", guarantorIds: [guarantor.id] })),
    ).rejects.toThrow(/at most 3× savings/);

    const loan = await withSociety(app.db, ids.socA, (tx) =>
      applyForLoan(tx, treasurer(), { memberId: borrower!.id, productId, amount: parseNaira("20000"), termMonths: 4, purpose: "School fees", guarantorIds: [guarantor.id] }),
    );
    expect(loan.loanNo).toBe(1);
    await expect(withSociety(app.db, ids.socA, (tx) => decideLoan(tx, actor(["treasurer", "chairperson"]), loan.id, "approve", ""))).rejects.toThrow(/recorded this application/);
    await withSociety(app.db, ids.socA, (tx) => decideLoan(tx, committee, loan.id, "approve", "Within policy"));

    // Disbursement is a journal submission; the loan goes live only when it's approved.
    const { submissionId } = await withSociety(app.db, ids.socA, (tx) =>
      disburseLoan(tx, treasurer(), loan.id, { disbursedOn: "2026-11-01", firstDueDate: "2026-11-30", bankAccountId: ids.bank, idempotencyKey: "disburse-1" }),
    );
    expect((await withSociety(app.db, ids.socA, (tx) => getLoan(tx, treasurer(), loan.id)))!.status).toBe("disbursing");
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, committee, submissionId));
    let detail = (await withSociety(app.db, ids.socA, (tx) => getLoan(tx, treasurer(), loan.id)))!;
    expect(detail.status).toBe("active");
    expect(detail.position.principalOutstanding).toBe(parseNaira("20000"));
    const first = detail.position.schedule!.instalments[0]!;
    expect(first.interest).toBe(parseNaira("200")); // 1% a month on ₦20,000
    const [bankLine] = (await admin`select amount from journal_lines where entry_id = (select id from journal_entries where submission_id = ${submissionId}) and account_id = ${ids.bank}`) as unknown as [{ amount: string }];
    expect(BigInt(bankLine.amount)).toBe(parseNaira("19800")); // 1% processing fee deducted

    // A missed instalment shows as arrears.
    const late = await withSociety(app.db, ids.socA, async (tx) => loanPosition(tx, (await tx.select().from(schema.loans).where(sql`id = ${loan.id}`))[0]!, "2026-12-15"));
    expect(late.arrears).toBe(first.payment);
    expect(late.daysPastDue).toBe(15);

    // Repayment: interest first, then principal; approved by another officer.
    const repay = await withSociety(app.db, ids.socA, (tx) => recordRepayment(tx, treasurer(), loan.id, { amount: first.payment, paidOn: "2026-11-30", bankAccountId: ids.bank, idempotencyKey: "repay-1" }));
    expect(repay.interest).toBe(parseNaira("200"));
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, committee, repay.submissionId));
    detail = (await withSociety(app.db, ids.socA, (tx) => getLoan(tx, treasurer(), loan.id)))!;
    expect(detail.position.principalOutstanding).toBe(kobo(parseNaira("20000") - first.principal));
    expect(detail.position.interestPaid).toBe(parseNaira("200"));

    // The database ties loan lines to the borrower.
    const s2 = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), fee("raw-loan-line")));
    await rejectsWith(
      withSociety(app.db, ids.socA, async (tx) => {
        await tx.update(schema.journalSubmissions).set({ status: "approved", decidedBy: ids.chair, decidedAt: new Date() }).where(sql`id = ${s2.id}`);
        const [e] = await tx
          .insert(schema.journalEntries)
          .values({ societyId: ids.socA, entryDate: "2026-10-31", description: "Entrance fee – raw-loan-line", idempotencyKey: "raw-loan-line", submissionId: s2.id, preparedBy: ids.treasurer, postedBy: ids.chair })
          .returning();
        await tx.insert(schema.journalLines).values([
          { societyId: ids.socA, entryId: e!.id, accountId: loanAcct.id, memberId: guarantor.id, loanId: loan.id, side: "debit", amount: 100n },
          { societyId: ids.socA, entryId: e!.id, accountId: ids.bank, side: "credit", amount: 100n },
        ]);
      }),
      /may only name the borrowing member/,
    );

    // Paying off the rest closes the loan.
    const rest = await withSociety(app.db, ids.socA, (tx) =>
      recordRepayment(tx, treasurer(), loan.id, { amount: detail.position.principalOutstanding, paidOn: "2026-11-30", bankAccountId: ids.bank, idempotencyKey: "repay-2" }),
    );
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, committee, rest.submissionId));
    expect((await withSociety(app.db, ids.socA, (tx) => getLoan(tx, treasurer(), loan.id)))!.status).toBe("closed");

    // A policy change doesn't touch existing loans: they keep their snapshot.
    await withSociety(app.db, ids.socA, (tx) => proposePolicyChange(tx, secretary, productId, { kind: "loan", policy: { ...policy, annualRateBps: 1800 } }));
    await withSociety(app.db, ids.socA, (tx) => approveProductPolicy(tx, committee, productId));
    const after = (await withSociety(app.db, ids.socA, (tx) => getLoan(tx, treasurer(), loan.id)))!;
    expect(after.policy.annualRateBps).toBe(1200);
    expect(after.policyVersion).toBe(1);
  });

  it("runs a month of payroll deductions from schedule to posting", async () => {
    const secretary = actor(["secretary"], ids.treasurer);
    const committee = actor(["chairperson"], ids.chair);
    const savingsId = await withSociety(app.db, ids.socA, (tx) => proposeProduct(tx, secretary, { kind: "savings", code: "ORD-SAV", name: "Ordinary savings", accountId: ids.savings, policy: DEFAULT_SAVINGS_POLICY }));
    const sharesId = await withSociety(app.db, ids.socA, (tx) => proposeProduct(tx, secretary, { kind: "shares", code: "ORD-SHR", name: "Ordinary shares", accountId: ids.shares, policy: DEFAULT_SHARES_POLICY }));
    for (const id of [savingsId, sharesId]) await withSociety(app.db, ids.socA, (tx) => approveProductPolicy(tx, committee, id));
    const people = await withSociety(app.db, ids.socA, (tx) => listMembers(tx, actor(["secretary"])));
    const a1 = people.find((m) => m.memberNo === "A-001")!;
    const a2 = people.find((m) => m.memberNo === "A-002")!;
    await withSociety(app.db, ids.socA, async (tx) => {
      await setContribution(tx, treasurer(), a1.id, savingsId, parseNaira("10000"));
      await setContribution(tx, treasurer(), a1.id, sharesId, parseNaira("5000"));
      await setContribution(tx, treasurer(), a2.id, savingsId, parseNaira("3000"));
    });

    // A running loan with instalments due in October and November.
    const [loanProduct] = await withSociety(app.db, ids.socA, (tx) => listProducts(tx, treasurer(), { kind: "loan" }));
    const loan = await withSociety(app.db, ids.socA, (tx) =>
      applyForLoan(tx, treasurer(), { memberId: a1.id, productId: loanProduct!.id, amount: parseNaira("12000"), termMonths: 3, purpose: "Rent", guarantorIds: [a2.id] }),
    );
    await withSociety(app.db, ids.socA, (tx) => decideLoan(tx, committee, loan.id, "approve", ""));
    const d = await withSociety(app.db, ids.socA, (tx) => disburseLoan(tx, treasurer(), loan.id, { disbursedOn: "2026-10-01", firstDueDate: "2026-10-31", bankAccountId: ids.bank, idempotencyKey: "pay-disburse" }));
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, committee, d.submissionId));

    const runId = await withSociety(app.db, ids.socA, (tx) => createPayrollRun(tx, treasurer(), { period: "2026-11", strategy: "loans_first" }));
    await expect(withSociety(app.db, ids.socA, (tx) => createPayrollRun(tx, treasurer(), { period: "2026-11", strategy: "loans_first" }))).rejects.toThrow(/already a run/);
    await expect(withSociety(app.db, ids.socA, (tx) => createPayrollRun(tx, actor(["auditor"], ids.auditor), { period: "2026-12", strategy: "pro_rata" }))).rejects.toBeInstanceOf(PermissionError);
    const schedule = await withSociety(app.db, ids.socA, (tx) => payrollSchedule(tx, treasurer(), runId));
    const s1 = schedule.find((r) => r.memberId === a1.id)!;
    const twoInstalments = (await withSociety(app.db, ids.socA, (tx) => getLoan(tx, treasurer(), loan.id)))!.position.schedule!.instalments.slice(0, 2).reduce((s, i) => s + i.payment, 0n);
    expect(s1).toMatchObject({ savings: parseNaira("10000"), shares: parseNaira("5000"), loans: twoInstalments });
    expect(schedule.find((r) => r.memberId === a2.id)!.total).toBe(parseNaira("3000"));
    await withSociety(app.db, ids.socA, (tx) => issuePayrollRun(tx, treasurer(), runId));

    // A file with a bad line is refused whole.
    const bad = await withSociety(app.db, ids.socA, (tx) => importRemittance(tx, treasurer(), runId, "Staff ID,Amount\nUL/2231,lots\n", "2026-11-28"));
    expect(bad.errors).toHaveLength(1);

    // A-001 pays ₦5,000 short; A-002 is missing; one line isn't anyone's.
    const paid = kobo(s1.total - parseNaira("5000"));
    const csv = `Staff ID,Name,Amount\nul/2231,"Okafor, Adaeze",${(Number(paid) / 100).toFixed(2)}\nZZ/9999,Unknown,700\n`;
    const result = await withSociety(app.db, ids.socA, (tx) => importRemittance(tx, treasurer(), runId, csv, "2026-11-28"));
    expect(result).toMatchObject({ lines: 2, matched: 1, unmatched: 1, errors: [] });
    const recon = await withSociety(app.db, ids.socA, (tx) => payrollReconciliation(tx, treasurer(), runId));
    expect(Object.fromEntries(recon.rows.map((r) => [r.memberNo, r.status]))).toEqual({ "A-001": "short", "A-002": "missing" });
    expect(recon.unmatched).toEqual([{ line: 3, externalId: "ZZ/9999", name: "Unknown", amount: parseNaira("700") }]);
    expect(recon.totals.shortfall).toBe(parseNaira("8000"));

    // Posting needs a second officer; the loan and suspense move only when it's approved.
    const { submissionId } = await withSociety(app.db, ids.socA, (tx) => submitPayrollRun(tx, treasurer(), runId, { bankAccountId: ids.bank, idempotencyKey: "payroll-2026-11" }));
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, committee, submissionId));
    const [run] = (await admin`select status from payroll_runs where id = ${runId}`) as unknown as [{ status: string }];
    expect(run.status).toBe("posted");
    const after = (await withSociety(app.db, ids.socA, (tx) => getLoan(tx, treasurer(), loan.id)))!;
    expect(after.position.arrears).toBe(0n); // loans first: both instalments were met
    const tb = await withSociety(app.db, ids.socA, (tx) => trialBalance(tx));
    expect(tb.find((r) => r.code === "2900")!.balance).toBe(parseNaira("700"));
    expect(tb.reduce((s, r) => s + r.debit, 0n)).toBe(tb.reduce((s, r) => s + r.credit, 0n));
    // A posted run is history.
    await rejectsWith(withSociety(app.db, ids.socA, (tx) => tx.execute(sql`delete from payroll_items where run_id = ${runId}`)), /can no longer change/);
  });

  it("produces financial statements that agree with the ledger", async () => {
    const tb = await withSociety(app.db, ids.socA, (tx) => trialBalance(tx));
    const position = await withSociety(app.db, ids.socA, (tx) => financialPosition(tx, treasurer(), "2027-12-31"));
    expect(position.balanced).toBe(true);
    expect(position.totals.assets).toBe(tb.filter((r) => r.class === "asset").reduce((s, r) => s + r.balance, 0n));
    const statement = await withSociety(app.db, ids.socA, (tx) => incomeStatement(tx, treasurer(), "2000-01-01", "2027-12-31"));
    const tbSurplus = tb.filter((r) => r.class === "income").reduce((s, r) => s + r.balance, 0n) - tb.filter((r) => r.class === "expense").reduce((s, r) => s + r.balance, 0n);
    expect(statement.totals.surplus).toBe(tbSurplus);
    expect(position.surplus).toBe(tbSurplus);
    expect(statement.statutoryReserve).toBe(kobo((tbSurplus * 25n + 50n) / 100n));
    // A period excludes what falls outside it.
    const before = await withSociety(app.db, ids.socA, (tx) => incomeStatement(tx, treasurer(), "2000-01-01", "2000-12-31"));
    expect(before.totals.surplus).toBe(0n);

    // A member statement's closing balances equal the member's balances; the period splits opening from movements.
    const [a1] = (await withSociety(app.db, ids.socA, (tx) => listMembers(tx, actor(["secretary"])))).filter((m) => m.memberNo === "A-001");
    const accounts = await withSociety(app.db, ids.socA, (tx) => memberStatement(tx, treasurer(), a1!.id, "2026-11-01", "2027-12-31"));
    const balances = await withSociety(app.db, ids.socA, (tx) => memberBalances(tx, a1!.id));
    for (const b of balances) expect(accounts.find((a) => a.code === b.code)!.closing, b.code).toBe(b.balance);
    const savings = accounts.find((a) => a.code === "2100")!;
    expect(savings.opening).toBe(parseNaira("10000")); // the October remittance, before the period
    expect(savings.lines.every((l) => l.date >= "2026-11-01")).toBe(true);
    await expect(withSociety(app.db, ids.socA, (tx) => memberStatement(tx, actor(["secretary"]), a1!.id, "2026-01-01", "2026-12-31"))).rejects.toBeInstanceOf(PermissionError);

    const aging = await withSociety(app.db, ids.socA, (tx) => loanAging(tx, treasurer(), "2027-03-15"));
    expect(aging.buckets.reduce((s, b) => s + b.outstanding, 0n)).toBe(aging.total);
    expect(aging.loans.every((l) => l.position.daysPastDue > 30)).toBe(true); // the payroll loan's last instalment fell due in December
  });

  it("gives a member portal access to their own records only", async () => {
    const secretary = actor(["secretary"], ids.treasurer);
    const people = await withSociety(app.db, ids.socA, (tx) => listMembers(tx, actor(["secretary"])));
    const a1 = people.find((m) => m.memberNo === "A-001")!;
    const a2 = people.find((m) => m.memberNo === "A-002")!;
    const invite = await withSociety(app.db, ids.socA, (tx) => inviteMember(tx, secretary, a1.id, "adaeze@example.ng"));
    const found = await findInvitation(app.db, invite.token);
    expect(found).toMatchObject({ status: "valid", roles: ["member"], memberId: a1.id });
    // Member invitations don't clutter the officers' list.
    expect((await withSociety(app.db, ids.socA, (tx) => listOpenInvitations(tx, secretary))).some((i) => i.email === "adaeze@example.ng")).toBe(false);
    const [portalUser] = await adminDb.insert(schema.users).values({ email: "adaeze@example.ng", name: "Adaeze (portal)" }).returning();
    if (found.status !== "valid") throw new Error("unreachable");
    await withSociety(app.db, ids.socA, (tx) => acceptInvitation(tx, found.id, { id: portalUser!.id, email: "adaeze@example.ng" }));
    const [membership] = await listUserSocieties(app.db, portalUser!.id);
    expect(membership).toMatchObject({ roles: ["member"], memberId: a1.id });
    await expect(withSociety(app.db, ids.socA, (tx) => inviteMember(tx, secretary, a1.id, "other@example.ng"))).rejects.toThrow(/already has portal access/);
    // The database won't hold a member role without its member record.
    await rejectsWith(adminDb.insert(schema.societyUsers).values({ societyId: ids.socA, userId: ids.auditor, roles: ["member"] }), /society_users_member_role/);

    const me: Actor = { userId: portalUser!.id, societyId: ids.socA, roles: ["member"], memberId: a1.id };
    const own = await withSociety(app.db, ids.socA, (tx) => memberStatement(tx, me, a1.id, "2026-01-01", "2027-12-31"));
    expect(own.length).toBeGreaterThan(0);
    await expect(withSociety(app.db, ids.socA, (tx) => memberStatement(tx, me, a2.id, "2026-01-01", "2027-12-31"))).rejects.toBeInstanceOf(PermissionError);
    await expect(withSociety(app.db, ids.socA, (tx) => listJournal(tx, me, { memberId: a2.id }))).rejects.toBeInstanceOf(PermissionError);
    await expect(withSociety(app.db, ids.socA, (tx) => listJournal(tx, me))).rejects.toBeInstanceOf(PermissionError);
    const loansSeen = await withSociety(app.db, ids.socA, (tx) => listLoans(tx, me));
    expect(loansSeen.length).toBeGreaterThan(0);
    expect(loansSeen.every((l) => l.memberId === a1.id)).toBe(true);
    await expect(withSociety(app.db, ids.socA, (tx) => listMembers(tx, me))).rejects.toBeInstanceOf(PermissionError);

    // A member may apply for themselves, never for someone else; an officer decides.
    const [loanProduct] = await withSociety(app.db, ids.socA, (tx) => listProducts(tx, me, { kind: "loan" }));
    await expect(
      withSociety(app.db, ids.socA, (tx) => applyForLoan(tx, me, { memberId: a2.id, productId: loanProduct!.id, amount: parseNaira("5000"), termMonths: 2, purpose: "Not mine", guarantorIds: [a1.id] })),
    ).rejects.toBeInstanceOf(PermissionError);
    const check = await withSociety(app.db, ids.socA, (tx) => loanEligibility(tx, me, { memberId: a1.id, productId: loanProduct!.id, amount: parseNaira("5000"), termMonths: 2, guarantors: 1 }));
    expect(check.checks.find((c) => c.key === "running")!.ok).toBe(false); // the payroll-month loan is still running
    await expect(
      withSociety(app.db, ids.socA, (tx) => loanEligibility(tx, me, { memberId: a2.id, productId: loanProduct!.id, amount: parseNaira("5000"), termMonths: 2, guarantors: 1 })),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      withSociety(app.db, ids.socA, (tx) => applyForLoan(tx, me, { memberId: a1.id, productId: loanProduct!.id, amount: parseNaira("5000"), termMonths: 2, purpose: "School books", guarantorIds: [a2.id] })),
    ).rejects.toThrow(/running loan/);
  });

  it("lets TechVaults staff onboard a society, seeing counts but not finances", async () => {
    const input = { name: "Kano Traders Thrift Society (test)", state: "Kano", registrar: "Kano State Director of Co-operatives", sector: "market", secretaryEmail: "Sec@Example.ng" };
    await expect(createSociety(app.db, ids.treasurer, input)).rejects.toBeInstanceOf(PermissionError);
    await expect(listPlatformSocieties(app.db, ids.treasurer)).rejects.toThrow(/Platform staff only|platform staff/i);
    await admin`update users set is_platform_staff = true where id = ${ids.auditor}`;
    const created = await createSociety(app.db, ids.auditor, input);
    const again = await createSociety(app.db, ids.auditor, { ...input, secretaryEmail: "other@example.ng" });
    const [a, b] = (await admin`select slug from societies where id in (${created.societyId}, ${again.societyId}) order by created_at`) as unknown as { slug: string }[];
    expect(a!.slug).toBe("kano-traders-thrift-society-test");
    expect(b!.slug).not.toBe(a!.slug);
    const accounts = (await admin`select code from ledger_accounts where society_id = ${created.societyId} order by code`) as unknown as { code: string }[];
    expect(accounts.map((x) => x.code)).toContain("4300"); // market levies
    expect(accounts.map((x) => x.code)).toContain("3900");
    const invite = await findInvitation(app.db, created.token);
    expect(invite).toMatchObject({ status: "valid", email: "sec@example.ng", roles: ["secretary"], societyId: created.societyId });
    const list = await listPlatformSocieties(app.db, ids.auditor);
    expect(list.find((x) => x.id === created.societyId)).toMatchObject({ sector: "market", members: 0, officers: 0 });
    expect(list.find((x) => x.id === ids.socA)!.members).toBeGreaterThan(0);
    // The summary carries no money fields.
    expect(Object.keys(list[0]!)).not.toContain("balance");
    await admin`update users set is_platform_staff = false where id = ${ids.auditor}`;
  });

  it("imports a member register and opening balances, all or nothing", async () => {
    const secretary = actor(["secretary"]);
    const bad = "Member no,Full name,Staff ID,Joined\nA-001,Clash With Existing,,05/01/2024\nIMP-01,Ngozi Obi,UL/9001,05/01/2024\nIMP-02,Sule Hassan,UL/9002,\n";
    const preview = await withSociety(app.db, ids.socA, (tx) => previewMemberImport(tx, secretary, bad));
    expect(preview.rows.map((r) => r.memberNo)).toEqual(["IMP-01", "IMP-02"]);
    expect(preview.issues).toEqual([{ line: 2, message: "member no A-001 is already on the register" }]);
    await expect(withSociety(app.db, ids.socA, (tx) => importMembers(tx, secretary, bad))).rejects.toThrow(/nothing was imported/);
    await expect(withSociety(app.db, ids.socA, (tx) => importMembers(tx, treasurer(), bad))).rejects.toBeInstanceOf(PermissionError);
    const good = bad.split("\n").filter((l) => !l.startsWith("A-001")).join("\n");
    expect(await withSociety(app.db, ids.socA, (tx) => importMembers(tx, secretary, good))).toBe(2);
    const imported = (await withSociety(app.db, ids.socA, (tx) => listMembers(tx, secretary))).filter((m) => m.memberNo.startsWith("IMP-"));
    expect(imported.map((m) => [m.memberNo, m.staffId, m.joinedOn])).toEqual([["IMP-01", "UL/9001", "2024-01-05"], ["IMP-02", "UL/9002", null]]);

    // Opening balances: savings and shares only, every member must exist.
    const withLoan = "Member no,2100,3100,1300\nIMP-01,50000,10000,\nIMP-02,25000.50,,\nNOPE,1,,\n";
    const p1 = await withSociety(app.db, ids.socA, (tx) => previewOpeningBalances(tx, treasurer(), withLoan));
    expect(p1.issues.map((i) => i.message).join(" ")).toMatch(/1300.*Loan balances come across with their loans.*NOPE isn't on the register/s);
    const csv = "Member no,2100,3100\nIMP-01,50000,10000\nIMP-02,25000.50,\n";
    const p2 = await withSociety(app.db, ids.socA, (tx) => previewOpeningBalances(tx, treasurer(), csv));
    expect(p2.issues).toEqual([]);
    expect(p2.total).toBe(parseNaira("85000.50"));
    const s = await withSociety(app.db, ids.socA, (tx) => submitOpeningBalances(tx, treasurer(), csv, "2026-09-30"));
    const again = await withSociety(app.db, ids.socA, (tx) => submitOpeningBalances(tx, treasurer(), csv, "2026-09-30"));
    expect(again).toMatchObject({ id: s.id, created: false }); // the same file can't be brought across twice
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, actor(["chairperson"], ids.chair), s.id));
    const ngozi = imported[0]!;
    const balances = await withSociety(app.db, ids.socA, (tx) => memberBalances(tx, ngozi.id));
    expect(balances.map((b) => [b.code, b.balance])).toEqual([["2100", parseNaira("50000")], ["3100", parseNaira("10000")]]);
    const tb = await withSociety(app.db, ids.socA, (tx) => trialBalance(tx));
    expect(tb.find((r) => r.code === "3900")!.balance).toBe(kobo(-parseNaira("85000.50")));
  });

  it("pays a savings withdrawal after the notice period, with two officers", async () => {
    const committee = actor(["chairperson"], ids.chair);
    const ngozi = (await withSociety(app.db, ids.socA, (tx) => listMembers(tx, actor(["secretary"])))).find((m) => m.memberNo === "IMP-01")!;
    const [savings] = await withSociety(app.db, ids.socA, (tx) => listProducts(tx, treasurer(), { kind: "savings" }));
    const id = await withSociety(app.db, ids.socA, (tx) =>
      requestWithdrawal(tx, treasurer(), { memberId: ngozi.id, productId: savings!.id, amount: parseNaira("40000"), reason: "School fees", requestedOn: "2026-10-18" }),
    );
    // ₦50,000 balance, ₦40,000 already requested: another ₦15,000 is too much.
    await expect(
      withSociety(app.db, ids.socA, (tx) => requestWithdrawal(tx, treasurer(), { memberId: ngozi.id, productId: savings!.id, amount: parseNaira("15000"), requestedOn: "2026-10-18" })),
    ).rejects.toThrow(/available balance/);
    await expect(withSociety(app.db, ids.socA, (tx) => decideWithdrawal(tx, actor(["treasurer", "chairperson"]), id, "approve", ""))).rejects.toThrow(/recorded this request/);
    await withSociety(app.db, ids.socA, (tx) => decideWithdrawal(tx, committee, id, "approve", ""));
    const [w] = await withSociety(app.db, ids.socA, (tx) => listWithdrawals(tx, treasurer(), { memberId: ngozi.id }));
    expect(w).toMatchObject({ status: "approved", earliestPayment: "2026-11-17" }); // 30 days' notice
    await expect(withSociety(app.db, ids.socA, (tx) => payWithdrawal(tx, treasurer(), id, { bankAccountId: ids.bank, paidOn: "2026-11-01", idempotencyKey: "wd-early" }))).rejects.toThrow(/notice period/);
    const submissionId = await withSociety(app.db, ids.socA, (tx) => payWithdrawal(tx, treasurer(), id, { bankAccountId: ids.bank, paidOn: "2026-11-17", idempotencyKey: "wd-1" }));
    let balances = await withSociety(app.db, ids.socA, (tx) => memberBalances(tx, ngozi.id));
    expect(balances.find((b) => b.code === "2100")!.balance).toBe(parseNaira("50000")); // not until approved
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, committee, submissionId));
    balances = await withSociety(app.db, ids.socA, (tx) => memberBalances(tx, ngozi.id));
    expect(balances.find((b) => b.code === "2100")!.balance).toBe(parseNaira("10000"));
    expect((await withSociety(app.db, ids.socA, (tx) => listWithdrawals(tx, treasurer(), { memberId: ngozi.id })))[0]!.status).toBe("paid");
  });

  it("brings running loans across, live only once a second officer approves", async () => {
    const csv = "Member no,Product code,Outstanding,Remaining months,Next due date\nIMP-02,REG-LOAN,12000,4,30/11/2026\nNOPE,REG-LOAN,1,1,30/11/2026\n";
    const p1 = await withSociety(app.db, ids.socA, (tx) => previewLegacyLoans(tx, treasurer(), csv, "2026-10-31"));
    expect(p1.issues).toEqual([{ line: 3, message: "member no NOPE isn't on the register" }]);
    const good = csv.split("\n").filter((l) => !l.startsWith("NOPE")).join("\n");
    const p2 = await withSociety(app.db, ids.socA, (tx) => previewLegacyLoans(tx, treasurer(), good, "2026-10-31"));
    expect(p2.loans[0]).toMatchObject({ memberNo: "IMP-02", outstanding: parseNaira("12000"), remainingMonths: 4 });
    expect(p2.loans[0]!.monthlyPayment > parseNaira("3000")).toBe(true);
    const r = await withSociety(app.db, ids.socA, (tx) => submitLegacyLoans(tx, treasurer(), good, "2026-10-31"));
    await expect(withSociety(app.db, ids.socA, (tx) => submitLegacyLoans(tx, treasurer(), good, "2026-10-31"))).rejects.toThrow(/already been brought across/);
    const sule = (await withSociety(app.db, ids.socA, (tx) => listMembers(tx, actor(["secretary"])))).find((m) => m.memberNo === "IMP-02")!;
    let [loan] = await withSociety(app.db, ids.socA, (tx) => listLoans(tx, treasurer(), { memberId: sule.id }));
    expect(loan!.status).toBe("disbursing");
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, actor(["chairperson"], ids.chair), r.submissionId));
    const detail = (await withSociety(app.db, ids.socA, (tx) => getLoan(tx, treasurer(), loan!.id)))!;
    expect(detail.status).toBe("active");
    expect(detail.position.principalOutstanding).toBe(parseNaira("12000"));
    expect(detail.position.nextDue?.dueDate).toBe("2026-11-30");
  });

  it("closes a year into reserves and locks it", async () => {
    const committee = actor(["chairperson"], ids.chair);
    const year = lastCompletedYear("2027-01-15", 1);
    expect(year).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(lastCompletedYear("2027-08-01", 7)).toEqual({ start: "2026-07-01", end: "2027-06-30" });
    const before = await withSociety(app.db, ids.socA, (tx) => incomeStatement(tx, treasurer(), year.start, year.end));
    const preview = await withSociety(app.db, ids.socA, (tx) => previewYearEnd(tx, treasurer(), year));
    expect(preview.surplus).toBe(before.totals.surplus);
    expect(preview.statutoryReserve).toBe(before.statutoryReserve);
    const reserveBefore = (await withSociety(app.db, ids.socA, (tx) => trialBalance(tx))).find((r) => r.code === "3200")?.balance ?? 0n;
    const { submissionId } = await withSociety(app.db, ids.socA, (tx) => submitYearEnd(tx, treasurer(), year));
    await expect(withSociety(app.db, ids.socA, (tx) => submitYearEnd(tx, treasurer(), year))).rejects.toThrow(/waiting for approval/);
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, committee, submissionId));
    const tb = await withSociety(app.db, ids.socA, (tx) => trialBalance(tx));
    // 2026's income and expenses are closed; reserves and accumulated surplus carry the result.
    const yearEnd2026 = await withSociety(app.db, ids.socA, (tx) => previewYearEnd(tx, treasurer(), year));
    expect(yearEnd2026.status).toBe("closed");
    expect(tb.find((r) => r.code === "3200")!.balance).toBe(kobo(reserveBefore + preview.statutoryReserve));
    expect(tb.find((r) => r.code === "3400")!.balance).toBe(kobo(preview.surplus - preview.statutoryReserve));
    expect(tb.reduce((s, r) => s + r.debit, 0n)).toBe(tb.reduce((s, r) => s + r.credit, 0n));
    // The year's own report is unchanged by the closing entry.
    const after = await withSociety(app.db, ids.socA, (tx) => incomeStatement(tx, treasurer(), year.start, year.end));
    expect(after.totals.surplus).toBe(before.totals.surplus);
    // Nothing more can be dated in the closed year (the database trigger enforces the same rule).
    await expect(withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), { ...fee("late-2026"), entryDate: "2026-12-15" }))).rejects.toThrow(/books are closed up to 2026-12-31/);
    const s = await withSociety(app.db, ids.socA, (tx) => submitJournalEntry(tx, treasurer(), { ...fee("early-2027"), entryDate: "2027-01-02" }));
    await withSociety(app.db, ids.socA, (tx) => approveSubmission(tx, committee, s.id));
  });
});
