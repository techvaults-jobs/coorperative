/**
 * Seeds a demo society with clearly synthetic data, and an administrator account.
 * Safe to run repeatedly: it does nothing if the demo society already exists.
 *
 *   DATABASE_ADMIN_URL=...  SEED_ADMIN_EMAIL=...  SEED_ADMIN_PASSWORD=...  pnpm --filter @techvaults/web seed
 *
 * Runs as the database owner because onboarding a society happens before anyone in it can act.
 * Every financial record still goes through the normal services, so the audit chain is complete:
 * the admin prepares each entry and a demo chairperson approves it. The chairperson has no
 * password and cannot sign in; invite a real approver from the Officers page.
 */
import { parseNaira, type Role } from "@techvaults/core";
import { approveSubmission, createDb, createMember, schema, sql, submitJournalEntry, withSociety, type Actor, type Tx } from "@techvaults/db";
import { hashPassword } from "better-auth/crypto";

const DEMO_SLUG = "demo-staff-cooperative";
const ADMIN_ROLES: Role[] = ["secretary", "treasurer", "auditor"];
const CHAIR_ROLES: Role[] = ["chairperson"];

const url = process.env.DATABASE_ADMIN_URL;
const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!url || !email || !password) {
  // On deploy the seed is optional: skip quietly when no admin is configured.
  if (process.argv.includes("--optional")) {
    console.log("Seed skipped: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set.");
    process.exit(0);
  }
  throw new Error("Set DATABASE_ADMIN_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD");
}
if (password.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");

const { db, close } = createDb(url);

const MEMBERS = [
  ["DSC-0001", "Adaeze Okonkwo", "DS/1001", "Bursary"],
  ["DSC-0002", "Babatunde Adeyemi", "DS/1002", "Registry"],
  ["DSC-0003", "Chiamaka Eze", "DS/1003", "Library"],
  ["DSC-0004", "Danjuma Ibrahim", "DS/1004", "Works"],
  ["DSC-0005", "Efe Oghenekaro", "DS/1005", "Computer Centre"],
  ["DSC-0006", "Funmilayo Ogunleye", "DS/1006", "Bursary"],
  ["DSC-0007", "Garba Musa", "DS/1007", "Security"],
  ["DSC-0008", "Halima Abubakar", "DS/1008", "Health Centre"],
  ["DSC-0009", "Ifeanyi Nwosu", "DS/1009", "Faculty of Science"],
  ["DSC-0010", "Jumoke Balogun", "DS/1010", "Faculty of Arts"],
] as const;

const ACCOUNTS = [
  ["1100", "Bank – current account", "asset", false],
  ["1300", "Members' loans", "asset", true],
  ["2100", "Members' ordinary savings", "liability", true],
  ["3100", "Members' share capital", "equity", true],
  ["3200", "Statutory reserve fund (Act s.34)", "equity", false],
  ["4100", "Entrance fees", "income", false],
  ["4200", "Interest on loans", "income", false],
  ["5100", "Bank charges", "expense", false],
  ["5200", "Stationery and printing", "expense", false],
] as const;

async function main() {
  const existing = await db.select().from(schema.societies).where(sql`slug = ${DEMO_SLUG}`);
  if (existing.length > 0) {
    console.log("Demo society already exists; nothing to do.");
    return;
  }

  const [society] = await db
    .insert(schema.societies)
    .values({
      name: "Demo Staff Cooperative (synthetic data)",
      slug: DEMO_SLUG,
      state: "Lagos",
      registrar: "Lagos State Director of Co-operatives",
      registrationNumber: "DEMO-0000",
    })
    .returning();

  const [admin] = await db
    .insert(schema.users)
    .values({ email: email!, name: "Demo Administrator", emailVerified: true })
    .onConflictDoUpdate({ target: schema.users.email, set: { updatedAt: new Date() } })
    .returning();
  const hasCredential = await db.select().from(schema.accounts).where(sql`user_id = ${admin!.id} and provider_id = 'credential'`);
  if (hasCredential.length === 0) {
    await db.insert(schema.accounts).values({
      userId: admin!.id,
      accountId: admin!.id,
      providerId: "credential",
      password: await hashPassword(password!),
    });
  }
  const [chair] = await db
    .insert(schema.users)
    .values({ email: `chair@${DEMO_SLUG}.invalid`, name: "Demo Chairperson (no sign-in)" })
    .onConflictDoUpdate({ target: schema.users.email, set: { updatedAt: new Date() } })
    .returning();
  await db.insert(schema.societyUsers).values([
    { societyId: society!.id, userId: admin!.id, roles: ADMIN_ROLES },
    { societyId: society!.id, userId: chair!.id, roles: CHAIR_ROLES },
  ]);

  const accounts = await db
    .insert(schema.ledgerAccounts)
    .values(ACCOUNTS.map(([code, name, cls, control]) => ({ societyId: society!.id, code, name, class: cls, isMemberControl: control })))
    .returning();
  const acct = (code: string) => accounts.find((a) => a.code === code)!.id;
  const actor: Actor = { userId: admin!.id, societyId: society!.id, roles: ADMIN_ROLES };
  const approver: Actor = { userId: chair!.id, societyId: society!.id, roles: CHAIR_ROLES };
  const postJournalEntry = async (tx: Tx, preparer: Actor, draft: Parameters<typeof submitJournalEntry>[2]) =>
    approveSubmission(tx, approver, (await submitJournalEntry(tx, preparer, draft)).id);

  await withSociety(db, society!.id, async (tx) => {
    const members = [];
    for (const [memberNo, fullName, staffId, department] of MEMBERS) {
      members.push(await createMember(tx, actor, { memberNo, fullName, staffId, department, status: "active", joinedOn: "2026-01-05" }));
    }

    for (const m of members) {
      await postJournalEntry(tx, actor, {
        entryDate: "2026-01-05",
        description: `Entrance fee – ${m.memberNo}`,
        idempotencyKey: `seed:fee:${m.memberNo}`,
        lines: [
          { accountId: acct("1100"), side: "debit", amount: parseNaira("2000") },
          { accountId: acct("4100"), side: "credit", amount: parseNaira("2000") },
        ],
      });
    }

    for (const month of ["2026-08-31", "2026-09-30"]) {
      for (const [i, m] of members.entries()) {
        const savings = parseNaira(String(10000 + i * 2500));
        const shares = parseNaira("5000");
        await postJournalEntry(tx, actor, {
          entryDate: month,
          description: `${month.slice(0, 7)} payroll remittance – ${m.memberNo}`,
          idempotencyKey: `seed:payroll:${month}:${m.memberNo}`,
          lines: [
            { accountId: acct("1100"), side: "debit", amount: (savings + shares) as typeof savings },
            { accountId: acct("2100"), side: "credit", amount: savings, memberId: m.id },
            { accountId: acct("3100"), side: "credit", amount: shares, memberId: m.id },
          ],
        });
      }
    }

    // Illustrative loan only. Real interest rules come from each society's approved policy.
    await postJournalEntry(tx, actor, {
      entryDate: "2026-09-10",
      description: "Regular loan disbursement – DSC-0003",
      idempotencyKey: "seed:loan:DSC-0003",
      lines: [
        { accountId: acct("1300"), side: "debit", amount: parseNaira("150000"), memberId: members[2]!.id },
        { accountId: acct("1100"), side: "credit", amount: parseNaira("150000") },
      ],
    });
    await postJournalEntry(tx, actor, {
      entryDate: "2026-09-30",
      description: "Bank charges – September",
      idempotencyKey: "seed:charges:2026-09",
      lines: [
        { accountId: acct("5100"), side: "debit", amount: parseNaira("1250.50") },
        { accountId: acct("1100"), side: "credit", amount: parseNaira("1250.50") },
      ],
    });
  });

  console.log(`Seeded "${society!.name}" with ${MEMBERS.length} synthetic members. Admin: ${email}`);
}

await main().finally(close);
