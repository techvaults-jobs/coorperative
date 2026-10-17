/**
 * Database schema. Every table that holds society data carries `society_id`, and
 * row-level security (see migrations/0001_guardrails.sql) restricts each connection
 * to the society set in `app.society_id`. Amounts are bigint kobo.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const liabilityType = pgEnum("liability_type", ["limited", "unlimited"]);
export const memberStatus = pgEnum("member_status", ["applicant", "active", "suspended", "exiting", "exited", "deceased"]);
export const accountClass = pgEnum("account_class", ["asset", "liability", "equity", "income", "expense"]);
export const entrySide = pgEnum("entry_side", ["debit", "credit"]);

export const societies = pgTable("societies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  state: text("state").notNull(),
  /** Which Director of Co-operatives the society is registered with (Act s.1). */
  registrar: text("registrar").notNull(),
  registrationNumber: text("registration_number"),
  /** Cooperative Verification Number from the National Cooperative Smart Registry. */
  cvn: text("cvn"),
  liabilityType: liabilityType("liability_type").notNull().default("limited"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  isPlatformStaff: boolean("is_platform_staff").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const societyUsers = pgTable(
  "society_users",
  {
    societyId: uuid("society_id").notNull().references(() => societies.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    roles: text("roles").array().notNull(),
  },
  (t) => [primaryKey({ columns: [t.societyId, t.userId] })],
);

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull().references(() => societies.id),
    memberNo: text("member_no").notNull(),
    fullName: text("full_name").notNull(),
    staffId: text("staff_id"),
    department: text("department"),
    phone: text("phone"),
    email: text("email"),
    status: memberStatus("status").notNull().default("applicant"),
    joinedOn: date("joined_on"),
    /** National cooperative member ID, once issued. */
    coopId: text("coop_id"),
    /** Nominee under Act s.18 – kept separate from next of kin. */
    nomineeName: text("nominee_name"),
    nomineeRelationship: text("nominee_relationship"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("members_society_member_no").on(t.societyId, t.memberNo),
    uniqueIndex("members_society_staff_id").on(t.societyId, t.staffId),
    // Composite key so child rows can prove they belong to the same society.
    unique("members_society_id_id").on(t.societyId, t.id),
  ],
);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull().references(() => societies.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    class: accountClass("class").notNull(),
    /** Control accounts carry a member sub-ledger (savings, shares, loans). */
    isMemberControl: boolean("is_member_control").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("ledger_accounts_society_code").on(t.societyId, t.code),
    unique("ledger_accounts_society_id_id").on(t.societyId, t.id),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull().references(() => societies.id),
    entryNo: bigserial("entry_no", { mode: "bigint" }).notNull(),
    entryDate: date("entry_date").notNull(),
    description: text("description").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    reversesEntryId: uuid("reverses_entry_id"),
    policyVersionId: uuid("policy_version_id"),
    preparedBy: uuid("prepared_by").notNull().references(() => users.id),
    postedBy: uuid("posted_by").notNull().references(() => users.id),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("journal_entries_society_idempotency").on(t.societyId, t.idempotencyKey),
    unique("journal_entries_society_id_id").on(t.societyId, t.id),
    // An entry can be reversed at most once.
    uniqueIndex("journal_entries_reverses_once").on(t.reversesEntryId),
    foreignKey({ columns: [t.societyId, t.reversesEntryId], foreignColumns: [t.societyId, t.id] }),
    index("journal_entries_society_date").on(t.societyId, t.entryDate),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    societyId: uuid("society_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    accountId: uuid("account_id").notNull(),
    memberId: uuid("member_id"),
    side: entrySide("side").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    memo: text("memo"),
  },
  (t) => [
    check("journal_lines_amount_positive", sql`${t.amount} > 0`),
    foreignKey({ columns: [t.societyId, t.entryId], foreignColumns: [journalEntries.societyId, journalEntries.id] }),
    foreignKey({ columns: [t.societyId, t.accountId], foreignColumns: [ledgerAccounts.societyId, ledgerAccounts.id] }),
    foreignKey({ columns: [t.societyId, t.memberId], foreignColumns: [members.societyId, members.id] }),
    index("journal_lines_entry").on(t.entryId),
    index("journal_lines_account").on(t.societyId, t.accountId),
    index("journal_lines_member").on(t.societyId, t.memberId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    societyId: uuid("society_id").notNull().references(() => societies.id),
    sequence: integer("sequence").notNull(),
    actorId: uuid("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.societyId, t.sequence] })],
);
