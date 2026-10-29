/**
 * Seeds demo societies with clearly synthetic data, and an administrator account.
 * Safe to run repeatedly: each society is created only if its slug doesn't exist yet.
 *
 *   DATABASE_ADMIN_URL=...  SEED_ADMIN_EMAIL=...  SEED_ADMIN_PASSWORD=...  pnpm --filter @techvaults/web seed
 *
 * Runs as the database owner because onboarding a society happens before anyone in it can act.
 * Every financial record still goes through the normal services, so the audit chain is complete:
 * the admin prepares each entry and a demo chairperson approves it. The chairperson has no
 * password and cannot sign in; invite a real approver from the Officers page.
 */
import { DEFAULT_LOAN_POLICY, DEFAULT_SAVINGS_POLICY, DEFAULT_SHARES_POLICY, kobo, parseNaira, type Kobo, type Role } from "@techvaults/core";
import {
  applyForLoan,
  approveProductPolicy,
  approveSubmission,
  collectionSheet,
  createCollectionSheet,
  saveCollectionSheet,
  submitCollectionSheet,
  submitInterestRun,
  createAccount,
  createDb,
  createMember,
  decideLoan,
  disburseLoan,
  listProducts,
  proposeProduct,
  recordRepayment,
  schema,
  setContribution,
  sql,
  submitJournalEntry,
  withSociety,
  type Actor,
  type Tx,
} from "@techvaults/db";
import { hashPassword } from "better-auth/crypto";

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

type AccountDef = readonly [code: string, name: string, cls: "asset" | "liability" | "equity" | "income" | "expense", memberControl: boolean];
type Draft = Parameters<typeof submitJournalEntry>[2];

interface SocietyDef {
  slug: string;
  values: Omit<typeof schema.societies.$inferInsert, "slug">;
  accounts: readonly AccountDef[];
  populate: (ctx: { tx: Tx; actor: Actor; acct: (code: string) => string; post: (draft: Draft) => Promise<unknown> }) => Promise<string>;
}

async function ensureUser(userEmail: string, name: string, withPassword: boolean) {
  const [user] = await db
    .insert(schema.users)
    .values({ email: userEmail, name, emailVerified: true })
    .onConflictDoUpdate({ target: schema.users.email, set: { updatedAt: new Date() } })
    .returning();
  if (withPassword) {
    const hasCredential = await db.select().from(schema.accounts).where(sql`user_id = ${user!.id} and provider_id = 'credential'`);
    if (hasCredential.length === 0) {
      await db.insert(schema.accounts).values({ userId: user!.id, accountId: user!.id, providerId: "credential", password: await hashPassword(password!) });
    }
  }
  return user!;
}

async function seedSociety(def: SocietyDef) {
  const existing = await db.select().from(schema.societies).where(sql`slug = ${def.slug}`);
  if (existing.length > 0) {
    console.log(`${def.values.name} already exists; skipped.`);
    return;
  }
  const admin = await ensureUser(email!, "Demo Administrator", true);
  const chair = await ensureUser(`chair@${def.slug}.invalid`, "Demo Chairperson (no sign-in)", false);
  const [society] = await db.insert(schema.societies).values({ ...def.values, slug: def.slug }).returning();
  await db.insert(schema.societyUsers).values([
    { societyId: society!.id, userId: admin.id, roles: ADMIN_ROLES },
    { societyId: society!.id, userId: chair.id, roles: CHAIR_ROLES },
  ]);
  const accounts = await db
    .insert(schema.ledgerAccounts)
    .values(def.accounts.map(([code, name, cls, control]) => ({ societyId: society!.id, code, name, class: cls, isMemberControl: control })))
    .returning();
  const acct = (code: string) => accounts.find((a) => a.code === code)!.id;
  const actor: Actor = { userId: admin.id, societyId: society!.id, roles: ADMIN_ROLES };
  const approver: Actor = { userId: chair.id, societyId: society!.id, roles: CHAIR_ROLES };
  const summary = await withSociety(db, society!.id, (tx) =>
    def.populate({ tx, actor, acct, post: async (draft) => approveSubmission(tx, approver, (await submitJournalEntry(tx, actor, draft)).id) }),
  );
  console.log(`Seeded "${def.values.name}": ${summary}. Admin: ${email}`);
}

// ---------------------------------------------------------------------------
// 1. A university staff cooperative (payroll deductions)

const STAFF_MEMBERS = [
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

const staffSociety: SocietyDef = {
  slug: "demo-staff-cooperative",
  values: {
    name: "Demo Staff Cooperative (synthetic data)",
    state: "Lagos",
    registrar: "Lagos State Director of Co-operatives",
    registrationNumber: "DEMO-0000",
    sector: "workplace",
  },
  accounts: [
    ["1100", "Bank – current account", "asset", false],
    ["1300", "Members' loans", "asset", true],
    ["2100", "Members' ordinary savings", "liability", true],
    ["3100", "Members' share capital", "equity", true],
    ["3200", "Statutory reserve fund (Act s.34)", "equity", false],
    ["4100", "Entrance fees", "income", false],
    ["4200", "Interest on loans", "income", false],
    ["5100", "Bank charges", "expense", false],
    ["5200", "Stationery and printing", "expense", false],
  ],
  async populate({ tx, actor, acct, post }) {
    const members = [];
    for (const [memberNo, fullName, staffId, department] of STAFF_MEMBERS) {
      members.push(await createMember(tx, actor, { memberNo, fullName, staffId, department, status: "active", joinedOn: "2026-01-05" }));
    }
    for (const m of members) {
      await post({
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
        await post({
          entryDate: month,
          description: `${month.slice(0, 7)} payroll remittance – ${m.memberNo}`,
          idempotencyKey: `seed:payroll:${month}:${m.memberNo}`,
          lines: [
            { accountId: acct("1100"), side: "debit", amount: (savings + shares) as Kobo },
            { accountId: acct("2100"), side: "credit", amount: savings, memberId: m.id },
            { accountId: acct("3100"), side: "credit", amount: shares, memberId: m.id },
          ],
        });
      }
    }
    // Illustrative loan only. Real interest rules come from each society's approved policy.
    await post({
      entryDate: "2026-09-10",
      description: "Regular loan disbursement – DSC-0003",
      idempotencyKey: "seed:loan:DSC-0003",
      lines: [
        { accountId: acct("1300"), side: "debit", amount: parseNaira("150000"), memberId: members[2]!.id },
        { accountId: acct("1100"), side: "credit", amount: parseNaira("150000") },
      ],
    });
    await post({
      entryDate: "2026-09-30",
      description: "Bank charges – September",
      idempotencyKey: "seed:charges:2026-09",
      lines: [
        { accountId: acct("5100"), side: "debit", amount: parseNaira("1250.50") },
        { accountId: acct("1100"), side: "credit", amount: parseNaira("1250.50") },
      ],
    });
    return `${members.length} synthetic members`;
  },
};

// ---------------------------------------------------------------------------
// 2. A farmers' multipurpose cooperative with a year of history

const FARMERS = [
  "Abiodun Adebayo", "Bisola Akande", "Chinedu Okafor", "Damilola Ojo", "Emeka Nnadi", "Folake Oyelaran", "Gbenga Afolabi", "Hauwa Bello",
  "Ike Chukwu", "Joke Alabi", "Kehinde Ogundele", "Lami Yakubu", "Musa Danladi", "Ngozi Obi", "Olumide Bakare", "Patience Etim",
  "Rasheed Lawal", "Sade Olatunji", "Tunde Fashola", "Uche Ekwueme", "Victoria Akpan", "Wale Adeniyi", "Yetunde Bamidele", "Zainab Garba",
  "Ayo Ilesanmi", "Bola Shittu", "Chidi Anyanwu", "Dupe Oladipo", "Esther Okoro", "Femi Ajayi", "Grace Eze", "Hassan Sule",
  "Ibukun Adewale", "Jide Osho", "Kemi Fadahunsi", "Lanre Odusanya",
];
const CLUSTERS = ["Ikorodu cluster", "Epe cluster", "Badagry cluster", "Ibeju-Lekki cluster"];
const MONTHS = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const lastDay = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Deterministic pseudo-random numbers, so every seed produces the same demo. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const farmSociety: SocietyDef = {
  slug: "demo-farmers-multipurpose",
  values: {
    name: "Demo Farmers' Multipurpose Cooperative (synthetic data)",
    shortName: "Demo Farmers' Coop",
    state: "Lagos",
    registrar: "Lagos State Director of Co-operatives",
    registrationNumber: "DEMO-AGR-0001",
    sector: "agricultural",
    brandColor: "#9a5b12",
    address: "Km 4, Ikorodu–Itoikin Road, Ikorodu, Lagos (fictional)",
  },
  accounts: [
    ["1100", "Bank – current account", "asset", false],
    ["1200", "Cash in hand", "asset", false],
    ["1300", "Members' input loans", "asset", true],
    ["2100", "Members' savings", "liability", true],
    ["3100", "Members' share capital", "equity", true],
    ["3200", "Statutory reserve fund (Act s.34)", "equity", false],
    ["4100", "Entrance fees", "income", false],
    ["4200", "Interest on input loans", "income", false],
    ["4300", "Produce marketing commission", "income", false],
    ["5100", "Bank charges", "expense", false],
    ["5200", "Extension and training", "expense", false],
    ["5300", "Transport and haulage", "expense", false],
  ],
  async populate({ tx, actor, acct, post }) {
    const rand = rng(20261017);
    const members = [];
    for (const [i, fullName] of FARMERS.entries()) {
      // Members join in waves through the year, so the register grows.
      const joinMonth = MONTHS[Math.min(MONTHS.length - 1, Math.floor(i / 4))]!;
      const status = i === 7 ? "suspended" : i === 33 ? "exited" : i >= 34 ? "applicant" : "active";
      members.push({
        member: await createMember(tx, actor, {
          memberNo: `DFC-${String(i + 1).padStart(4, "0")}`,
          fullName,
          staffId: `FRM/${String(1001 + i)}`,
          department: CLUSTERS[i % CLUSTERS.length]!,
          status,
          joinedOn: `${joinMonth}-0${1 + (i % 8)}`,
        }),
        joinMonth,
        base: 5000 + Math.round(rand() * 12) * 500,
        status,
      });
    }
    let entries = 0;
    for (const { member, joinMonth, status } of members) {
      if (status === "applicant") continue;
      await post({
        entryDate: `${joinMonth}-10`,
        description: `Entrance fee – ${member.memberNo}`,
        idempotencyKey: `seed:fee:${member.memberNo}`,
        lines: [
          { accountId: acct("1200"), side: "debit", amount: parseNaira("1500") },
          { accountId: acct("4100"), side: "credit", amount: parseNaira("1500") },
        ],
      });
      entries++;
    }
    for (const [mi, ym] of MONTHS.entries()) {
      // Contributions rise after harvest months (Aug–Dec) and dip in the lean season.
      const season = [1.3, 1.4, 1.0, 0.8, 0.7, 0.75, 0.8, 0.9, 1.0, 1.2, 1.3, 1.25][mi]!;
      for (const { member, joinMonth, base, status } of members) {
        if (ym < joinMonth || status === "applicant" || (status === "exited" && ym > "2026-06") || (status === "suspended" && ym > "2026-03")) continue;
        const savings = parseNaira(String(Math.round((base * season) / 100) * 100));
        const shares = parseNaira(rand() < 0.5 ? "2000" : "1000");
        await post({
          entryDate: lastDay(ym),
          description: `${ym} contribution – ${member.memberNo}`,
          idempotencyKey: `seed:contrib:${ym}:${member.memberNo}`,
          lines: [
            { accountId: acct("1100"), side: "debit", amount: (savings + shares) as Kobo },
            { accountId: acct("2100"), side: "credit", amount: savings, memberId: member.id },
            { accountId: acct("3100"), side: "credit", amount: shares, memberId: member.id },
          ],
        });
        entries++;
      }
      // Input loans at planting (Mar–May), repaid after harvest. Illustrative only.
      if (["2026-03", "2026-04", "2026-05"].includes(ym)) {
        for (const { member } of members.filter((_, i) => i % 5 === mi % 5 && i < 24)) {
          const amount = parseNaira(String(50000 + Math.round(rand() * 6) * 10000));
          await post({
            entryDate: `${ym}-15`,
            description: `Input loan disbursement – ${member.memberNo}`,
            idempotencyKey: `seed:loan:${ym}:${member.memberNo}`,
            lines: [
              { accountId: acct("1300"), side: "debit", amount, memberId: member.id },
              { accountId: acct("1100"), side: "credit", amount },
            ],
          });
          entries++;
        }
      }
      if (["2026-08", "2026-09", "2026-10"].includes(ym)) {
        for (const { member } of members.filter((_, i) => i % 5 === (mi - 5) % 5 && i < 24)) {
          const principal = parseNaira("25000");
          const interest = parseNaira("1250");
          await post({
            entryDate: `${ym}-20`,
            description: `Input loan repayment – ${member.memberNo}`,
            idempotencyKey: `seed:repay:${ym}:${member.memberNo}`,
            lines: [
              { accountId: acct("1100"), side: "debit", amount: (principal + interest) as Kobo },
              { accountId: acct("1300"), side: "credit", amount: principal, memberId: member.id },
              { accountId: acct("4200"), side: "credit", amount: interest },
            ],
          });
          entries++;
        }
      }
      if (["2025-11", "2025-12", "2026-08", "2026-09", "2026-10"].includes(ym)) {
        const commission = parseNaira(String(40000 + Math.round(rand() * 30) * 1000));
        await post({
          entryDate: `${ym}-25`,
          description: `Produce marketing commission – ${ym}`,
          idempotencyKey: `seed:commission:${ym}`,
          lines: [
            { accountId: acct("1100"), side: "debit", amount: commission },
            { accountId: acct("4300"), side: "credit", amount: commission },
          ],
        });
        entries++;
      }
      const charges = parseNaira(String(800 + Math.round(rand() * 900)));
      await post({
        entryDate: lastDay(ym),
        description: `Bank charges – ${ym}`,
        idempotencyKey: `seed:charges:${ym}`,
        lines: [
          { accountId: acct("5100"), side: "debit", amount: charges },
          { accountId: acct("1100"), side: "credit", amount: charges },
        ],
      });
      entries++;
      if (mi % 3 === 1) {
        await post({
          entryDate: `${ym}-18`,
          description: `Extension officer training day – ${CLUSTERS[mi % CLUSTERS.length]}`,
          idempotencyKey: `seed:training:${ym}`,
          lines: [
            { accountId: acct("5200"), side: "debit", amount: parseNaira("35000") },
            { accountId: acct("1100"), side: "credit", amount: parseNaira("35000") },
          ],
        });
        entries++;
      }
    }
    return `${members.length} synthetic members, ${entries} approved entries`;
  },
};

// ---------------------------------------------------------------------------
// 3. A community thrift society that collects at a weekly meeting (D-027, D-028)

const COMMUNITY_MEMBERS = [
  "Abike Demo-Adisa",
  "Bisola Demo-Okafor",
  "Chidi Demo-Umeh",
  "Dupe Demo-Salami",
  "Emeka Demo-Obi",
  "Folake Demo-Ajayi",
  "Gbenga Demo-Lawal",
  "Hauwa Demo-Sani",
  "Ike Demo-Nnamdi",
  "Jide Demo-Oladipo",
  "Kemi Demo-Fashola",
  "Lami Demo-Yusuf",
] as const;

/** Mondays from the first to the last date given, inclusive. */
function mondays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 7)) out.push(d.toISOString().slice(0, 10));
  return out;
}

const communitySociety: SocietyDef = {
  slug: "demo-community-thrift",
  values: {
    name: "Demo Community Thrift Society (synthetic data)",
    state: "Oyo",
    registrar: "Oyo State Director of Co-operatives",
    registrationNumber: "DEMO-0002",
    sector: "credit_union",
    terminology: { externalId: "Card no.", group: "Zone", contribution: "Weekly contribution" },
    meetingWeekday: 1,
  },
  accounts: [
    ["1100", "Bank – current account", "asset", false],
    ["1200", "Cash in hand", "asset", false],
    ["1300", "Members' loans", "asset", true],
    ["1400", "Interest receivable on loans", "asset", false],
    ["2100", "Members' ordinary savings", "liability", true],
    ["2200", "Members' building fund", "liability", true],
    ["2900", "Unidentified remittances (suspense)", "liability", false],
    ["3100", "Members' share capital", "equity", true],
    ["3200", "Statutory reserve fund (Act s.34)", "equity", false],
    ["3900", "Opening balances", "equity", false],
    ["4200", "Interest on loans", "income", false],
    ["5200", "Stationery and printing", "expense", false],
  ],
  async populate({ tx, actor, acct, post }) {
    const [chairLink] = await tx.select().from(schema.societyUsers).where(sql`society_id = ${actor.societyId} and roles && array['chairperson']`);
    const approver: Actor = { userId: chairLink!.userId, societyId: actor.societyId, roles: CHAIR_ROLES };
    const officer: Actor = { ...actor, roles: [...ADMIN_ROLES, "loan_officer"] };

    const people: Awaited<ReturnType<typeof createMember>>[] = [];
    for (const [i, name] of COMMUNITY_MEMBERS.entries()) {
      people.push(await createMember(tx, officer, { memberNo: String(i + 1), fullName: name, status: "active", joinedOn: "2024-01-08" }));
    }

    // Products: the workbook's four columns, and its 1.5%-a-month weekly loan.
    const propose = (input: Parameters<typeof proposeProduct>[2]) => proposeProduct(tx, officer, input);
    const savingsId = await propose({ kind: "savings", code: "ORD-SAV", name: "Saving", accountId: acct("2100"), policy: { ...DEFAULT_SAVINGS_POLICY, minimumContribution: parseNaira("500"), withdrawalNoticeDays: 14 } });
    const buildingId = await propose({
      kind: "savings",
      code: "BLD-FUND",
      name: "Building",
      description: "Saved towards the society's building project; repaid on exit.",
      accountId: acct("2200"),
      policy: { ...DEFAULT_SAVINGS_POLICY, minimumContribution: kobo(0), withdrawable: false },
    });
    const sharesId = await propose({ kind: "shares", code: "ORD-SHR", name: "Share", accountId: acct("3100"), policy: { ...DEFAULT_SHARES_POLICY, sharePrice: parseNaira("500"), minimumShares: 2 } });
    const loanId = await propose({
      kind: "loan",
      code: "WK-LOAN",
      name: "Weekly loan",
      description: "Repaid in any amount at the weekly meeting; 1.5% a month on the balance. Illustrative terms.",
      accountId: acct("1300"),
      incomeAccountId: acct("4200"),
      policy: {
        ...DEFAULT_LOAN_POLICY,
        interestMethod: "flexible_weekly",
        annualRateBps: 1800,
        minTermMonths: 1,
        maxTermMonths: 24,
        minAmount: parseNaira("10000"),
        maxAmount: parseNaira("1000000"),
        savingsMultiple: 2,
        guarantorsRequired: 1,
        processingFeeBps: 0,
        minMembershipMonths: 3,
      },
    });
    for (const id of [savingsId, buildingId, sharesId, loanId]) await approveProductPolicy(tx, approver, id);

    // Balances brought across from the workbook at cut-over.
    const opening = (i: number) => ({ savings: parseNaira(String(150000 + i * 25000)), building: parseNaira(String(20000 + i * 2500)), shares: parseNaira("10000") });
    await post({
      entryDate: "2026-07-31",
      description: "Members' opening balances as at 2026-07-31",
      idempotencyKey: "seed:community:opening",
      lines: [
        ...people.flatMap((m, i) => {
          const o = opening(i);
          return [
            { accountId: acct("2100"), side: "credit" as const, amount: o.savings, memberId: m.id },
            { accountId: acct("2200"), side: "credit" as const, amount: o.building, memberId: m.id },
            { accountId: acct("3100"), side: "credit" as const, amount: o.shares, memberId: m.id },
          ];
        }),
        { accountId: acct("1100"), side: "debit", amount: kobo(people.reduce((s, _m, i) => s + opening(i).savings + opening(i).building + opening(i).shares, 0n)) },
      ],
    });

    // Usual weekly amounts pre-fill each meeting's sheet.
    for (const [i, m] of people.entries()) {
      await setContribution(tx, officer, m.id, savingsId, parseNaira(String(2000 + (i % 4) * 1000)));
      await setContribution(tx, officer, m.id, buildingId, parseNaira("500"));
      await setContribution(tx, officer, m.id, sharesId, parseNaira(i % 3 === 0 ? "500" : "0"));
    }

    // Four weekly loans paid out on 3 August, guaranteed by the next card.
    const loans: { memberIndex: number; id: string }[] = [];
    for (const [memberIndex, naira, months, purpose] of [
      [0, "300000", 12, "Restocking the shop"],
      [2, "250000", 10, "Sewing machine"],
      [4, "300000", 12, "Rent"],
      [7, "150000", 6, "School fees"],
    ] as const) {
      const loan = await applyForLoan(tx, officer, { memberId: people[memberIndex]!.id, productId: loanId, amount: parseNaira(naira), termMonths: months, purpose, guarantorIds: [people[memberIndex + 1]!.id] });
      await decideLoan(tx, approver, loan.id, "approve", "Within policy");
      const d = await disburseLoan(tx, officer, loan.id, { disbursedOn: "2026-08-03", firstDueDate: "2026-08-10", bankAccountId: acct("1100"), idempotencyKey: `seed:community:disburse:${memberIndex}` });
      await approveSubmission(tx, approver, d.submissionId);
      loans.push({ memberIndex, id: loan.id });
    }

    // Weekly meetings. Each month's interest is charged once its meetings are posted.
    const meetings = mondays("2026-08-10", "2026-10-26");
    let charged = "2026-07";
    let posted = 0;
    for (const [n, date] of meetings.entries()) {
      const month = date.slice(0, 7);
      const previous = `${month.slice(0, 4)}-${String(Number(month.slice(5)) - 1).padStart(2, "0")}`;
      if (previous > charged && previous >= "2026-08") {
        const run = await submitInterestRun(tx, officer, { period: previous, idempotencyKey: `seed:community:interest:${previous}` });
        await approveSubmission(tx, approver, run.submissionId);
        charged = previous;
      }
      const sheetId = await createCollectionSheet(tx, officer, { meetingDate: date });
      // The latest meeting stays open, as it would be on the evening it was held.
      if (n === meetings.length - 1) break;
      const sheet = (await collectionSheet(tx, officer, sheetId))!;
      const entries = sheet.rows.flatMap((r) => {
        const i = people.findIndex((p) => p.id === r.memberId);
        // Card 8 stops coming after August, so their loan falls behind; card 11 misses odd weeks.
        if ((i === 7 && date > "2026-08-31") || (i === 10 && n % 2 === 1)) return [];
        const amounts = { ...r.amounts };
        // Card 3 pays half the interest due, leaving interest arrears.
        if (i === 2 && amounts.interest) amounts.interest = kobo(amounts.interest / 2n);
        // Card 1 pays extra towards the loan in September.
        if (i === 0 && month === "2026-09" && amounts.loan) amounts.loan = kobo(amounts.loan + parseNaira("5000"));
        return [{ memberId: r.memberId, amounts }];
      });
      const saved = await saveCollectionSheet(tx, officer, sheetId, entries);
      if (saved.problems.length) throw new Error(`Seed meeting ${date}: ${saved.problems.map((p) => p.message).join("; ")}`);
      const total = kobo((await collectionSheet(tx, officer, sheetId))!.total);
      const transfers = kobo(n % 3 === 0 ? parseNaira("6000") : 0n);
      const s = await submitCollectionSheet(tx, officer, sheetId, {
        cashCounted: kobo(total - transfers),
        transfers,
        bankAccountId: acct("1100"),
        lodgementRef: `TLR-${date.replaceAll("-", "")}`,
        differenceNote: "",
        idempotencyKey: `seed:community:sheet:${date}`,
      });
      await approveSubmission(tx, approver, s.submissionId);
      posted++;
    }
    return `${people.length} members, ${loans.length} weekly loans, ${posted} posted meetings and one open sheet, interest charged to ${charged}`;
  },
};

// ---------------------------------------------------------------------------
// Products and sample loans. Runs for existing demo societies too, and only adds what's missing.

async function seedProducts(slug: string, loanName: string, sampleLoans: boolean) {
  const [society] = await db.select().from(schema.societies).where(sql`slug = ${slug}`);
  if (!society) return;
  const [admin] = await db.select().from(schema.users).where(sql`email = ${email}`);
  if (!admin) {
    console.log(`Products for ${society.name} skipped: no demo admin.`);
    return;
  }
  // Societies seeded before maker-checker have no demo approver yet; add one (no password, can't sign in).
  const chair = await ensureUser(`chair@${slug}.invalid`, "Demo Chairperson (no sign-in)", false);
  await db.insert(schema.societyUsers).values({ societyId: society.id, userId: chair.id, roles: CHAIR_ROLES }).onConflictDoNothing();
  const actor: Actor = { userId: admin.id, societyId: society.id, roles: [...ADMIN_ROLES, "loan_officer"] };
  const approver: Actor = { userId: chair.id, societyId: society.id, roles: ["chairperson", "principal_officer"] };
  const added = await withSociety(db, society.id, async (tx) => {
    if ((await listProducts(tx, actor)).length > 0) return 0;
    // The seed runs as the owner, which bypasses row-level security, so filter by society explicitly.
    const accounts = await tx.select().from(schema.ledgerAccounts).where(sql`society_id = ${society.id}`);
    const byCode = (code: string) => accounts.find((a) => a.code === code);
    const loanAcct = byCode("1300") ?? (await createAccount(tx, actor, { code: "1300", name: "Members' loans", class: "asset", isMemberControl: true }));
    const interest = byCode("4200") ?? (await createAccount(tx, actor, { code: "4200", name: "Interest on loans", class: "income" }));
    const ids = [
      await proposeProduct(tx, actor, {
        kind: "loan",
        code: "REG-LOAN",
        name: loanName,
        description: "Illustrative terms for the demo, pending each society's approved bye-laws.",
        accountId: loanAcct.id,
        incomeAccountId: interest.id,
        policy: { ...DEFAULT_LOAN_POLICY, minMembershipMonths: 3, guarantorsRequired: 1, savingsMultiple: 3 },
      }),
      await proposeProduct(tx, actor, {
        kind: "loan",
        code: "EMRG-LOAN",
        name: "Emergency loan",
        description: "Small, short loans for urgent needs.",
        accountId: loanAcct.id,
        incomeAccountId: interest.id,
        policy: { ...DEFAULT_LOAN_POLICY, interestMethod: "flat", annualRateBps: 600, maxTermMonths: 6, minTermMonths: 1, maxAmount: parseNaira("100000"), minAmount: parseNaira("5000"), savingsMultiple: null, guarantorsRequired: 0, processingFeeBps: 0, minMembershipMonths: 1 },
      }),
      await proposeProduct(tx, actor, { kind: "savings", code: "ORD-SAV", name: "Ordinary savings", accountId: byCode("2100")!.id, policy: DEFAULT_SAVINGS_POLICY }),
      await proposeProduct(tx, actor, { kind: "shares", code: "ORD-SHR", name: "Ordinary shares", accountId: byCode("3100")!.id, policy: DEFAULT_SHARES_POLICY }),
    ];
    for (const id of ids) await approveProductPolicy(tx, approver, id);
    if (sampleLoans) {
      const members = await tx.select().from(schema.members).where(sql`society_id = ${society.id} and status = 'active'`).orderBy(schema.members.memberNo);
      const bank = byCode("1100")!.id;
      const [regular] = (await listProducts(tx, actor, { kind: "loan" })).filter((p) => p.code === "REG-LOAN");
      const apply = (i: number, naira: string, months: number, purpose: string) =>
        applyForLoan(tx, actor, { memberId: members[i]!.id, productId: regular!.id, amount: parseNaira(naira), termMonths: months, purpose, guarantorIds: [members[i + 1]!.id] });
      // One running loan with a repayment, one approved awaiting disbursement, one awaiting decision.
      const running = await apply(0, "120000", 12, "Fertiliser and seedlings for the planting season");
      await decideLoan(tx, approver, running.id, "approve", "Within policy");
      const d = await disburseLoan(tx, actor, running.id, { disbursedOn: "2026-07-01", firstDueDate: "2026-07-31", bankAccountId: bank, idempotencyKey: `seed:disburse:${running.id}` });
      await approveSubmission(tx, approver, d.submissionId);
      for (const [n, paidOn] of [[1, "2026-07-31"], [2, "2026-08-31"], [3, "2026-09-30"]] as const) {
        const r = await recordRepayment(tx, actor, running.id, { amount: parseNaira("10661.85"), paidOn, bankAccountId: bank, idempotencyKey: `seed:repay:${running.id}:${n}` });
        await approveSubmission(tx, approver, r.submissionId);
      }
      const approved = await apply(2, "60000", 6, "Irrigation pump repairs");
      await decideLoan(tx, approver, approved.id, "approve", "Within policy");
      await apply(4, "45000", 9, "School fees");
    }
    return ids.length;
  });
  if (added) console.log(`Added ${added} demo products${sampleLoans ? " and sample loans" : ""} to ${society.name}.`);
}

/** Standing monthly contributions for the staff society, matching its seeded history. */
async function seedContributions(slug: string) {
  const [society] = await db.select().from(schema.societies).where(sql`slug = ${slug}`);
  const [admin] = await db.select().from(schema.users).where(sql`email = ${email}`);
  if (!society || !admin) return;
  const actor: Actor = { userId: admin.id, societyId: society.id, roles: ADMIN_ROLES };
  const set = await withSociety(db, society.id, async (tx) => {
    const existing = await tx.select().from(schema.memberContributions).where(sql`society_id = ${society.id}`);
    if (existing.length) return 0;
    const products = await tx.select().from(schema.products).where(sql`society_id = ${society.id} and status = 'active'`);
    const savings = products.find((p) => p.code === "ORD-SAV");
    const shares = products.find((p) => p.code === "ORD-SHR");
    if (!savings || !shares) return 0;
    const members = await tx.select().from(schema.members).where(sql`society_id = ${society.id} and status = 'active'`).orderBy(schema.members.memberNo);
    for (const [i, m] of members.entries()) {
      await setContribution(tx, actor, m.id, savings.id, parseNaira(String(10000 + i * 2500)));
      await setContribution(tx, actor, m.id, shares.id, parseNaira("5000"));
    }
    return members.length;
  });
  if (set) console.log(`Set monthly contributions for ${set} members of ${society.name}.`);
}

/** A TechVaults staff account for the platform console, from PLATFORM_STAFF_EMAIL / PLATFORM_STAFF_PASSWORD. */
async function seedPlatformStaff() {
  const staffEmail = process.env.PLATFORM_STAFF_EMAIL?.trim().toLowerCase();
  const staffPassword = process.env.PLATFORM_STAFF_PASSWORD;
  if (!staffEmail || !staffPassword) return;
  if (staffPassword.length < 12) throw new Error("PLATFORM_STAFF_PASSWORD must be at least 12 characters");
  const [user] = await db
    .insert(schema.users)
    .values({ email: staffEmail, name: "TechVaults Staff", emailVerified: true, isPlatformStaff: true })
    .onConflictDoUpdate({ target: schema.users.email, set: { isPlatformStaff: true, updatedAt: new Date() } })
    .returning();
  const hasCredential = await db.select().from(schema.accounts).where(sql`user_id = ${user!.id} and provider_id = 'credential'`);
  if (hasCredential.length === 0) {
    await db.insert(schema.accounts).values({ userId: user!.id, accountId: user!.id, providerId: "credential", password: await hashPassword(staffPassword) });
    console.log(`Platform staff account ready: ${staffEmail}`);
  }
}

try {
  await seedPlatformStaff();
  await seedSociety(staffSociety);
  await seedSociety(farmSociety);
  await seedSociety(communitySociety);
  await seedProducts(staffSociety.slug, "Regular loan", false);
  await seedProducts(farmSociety.slug, "Input loan", true);
  await seedContributions(staffSociety.slug);
} finally {
  await close();
}
