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
export const societySector = pgEnum("society_sector", ["workplace", "agricultural", "transport", "market", "multipurpose", "credit_union", "housing", "other"]);
export const productKind = pgEnum("product_kind", ["savings", "shares", "loan"]);
export const productStatus = pgEnum("product_status", ["proposed", "active", "retired"]);
export const loanStatus = pgEnum("loan_status", ["applied", "approved", "rejected", "withdrawn", "disbursing", "active", "closed"]);
export const payrollStatus = pgEnum("payroll_status", ["draft", "issued", "reconciled", "submitted", "posted"]);
export const payrollItemKind = pgEnum("payroll_item_kind", ["loan", "savings", "shares"]);
export const withdrawalStatus = pgEnum("withdrawal_status", ["requested", "approved", "rejected", "cancelled", "paying", "paid"]);
export const submissionStatus = pgEnum("submission_status", ["pending", "approved", "rejected", "withdrawn"]);

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
  sector: societySector("sector").notNull().default("workplace"),
  shortName: text("short_name"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  /** #rrggbb, at least 4.5:1 against white (checked in core/configuration). Null uses the product colour. */
  brandColor: text("brand_color"),
  /** 1–12; the month the society's financial year starts. */
  financialYearStart: integer("financial_year_start").notNull().default(1),
  /** Words that override the sector defaults (core Terminology). */
  terminology: jsonb("terminology").$type<Record<string, string>>().notNull().default({}),
  /** Modules switched on. Null means the sector profile's defaults. */
  modules: text("modules").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("societies_brand_color", sql`${t.brandColor} is null or ${t.brandColor} ~ '^#[0-9a-f]{6}$'`),
  check("societies_financial_year_start", sql`${t.financialYearStart} between 1 and 12`),
]);

// Authentication tables follow the field names Better Auth expects. They are not
// society-scoped: one person can hold roles in several societies (society_users).
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  isPlatformStaff: boolean("is_platform_staff").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier").on(t.identifier)],
);

export const twoFactors = pgTable(
  "two_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factors_user").on(t.userId), index("two_factors_secret").on(t.secret)],
);

export const societyUsers = pgTable(
  "society_users",
  {
    societyId: uuid("society_id").notNull().references(() => societies.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    roles: text("roles").array().notNull(),
    /** The member record this person is, when they use the member portal. FK added in migrations/0012. */
    memberId: uuid("member_id"),
  },
  (t) => [primaryKey({ columns: [t.societyId, t.userId] }), uniqueIndex("society_users_member").on(t.societyId, t.memberId)],
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
    /** Numbered 1, 2, 3… per society with no gaps, by a trigger at insert (migrations/0005). */
    entryNo: bigint("entry_no", { mode: "bigint" }).notNull().default(sql`0`),
    entryDate: date("entry_date").notNull(),
    description: text("description").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    reversesEntryId: uuid("reverses_entry_id"),
    policyVersionId: uuid("policy_version_id"),
    /** The approved submission this entry came from. Entries posted before maker-checker have none. */
    submissionId: uuid("submission_id"),
    kind: text("kind").notNull().default("standard"),
    preparedBy: uuid("prepared_by").notNull().references(() => users.id),
    /** The approver. Since maker-checker, always someone other than the preparer. */
    postedBy: uuid("posted_by").notNull().references(() => users.id),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("journal_entries_society_idempotency").on(t.societyId, t.idempotencyKey),
    unique("journal_entries_society_id_id").on(t.societyId, t.id),
    // An entry can be reversed at most once.
    uniqueIndex("journal_entries_reverses_once").on(t.reversesEntryId),
    uniqueIndex("journal_entries_society_entry_no").on(t.societyId, t.entryNo),
    uniqueIndex("journal_entries_submission").on(t.submissionId),
    foreignKey({ columns: [t.societyId, t.reversesEntryId], foreignColumns: [t.societyId, t.id] }),
    index("journal_entries_society_date").on(t.societyId, t.entryDate),
  ],
);

/** Line of a submission awaiting approval; amounts are kobo as decimal strings (JSON has no bigint). */
export interface SubmissionLine {
  accountId: string;
  side: "debit" | "credit";
  amount: string;
  memberId?: string;
  loanId?: string;
  memo?: string;
}

/**
 * Journal entries waiting for a second officer. Only the decision columns can change, and
 * only once (see migrations/0005); approval posts the entry to journal_entries.
 */
export const journalSubmissions = pgTable(
  "journal_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull().references(() => societies.id),
    entryDate: date("entry_date").notNull(),
    description: text("description").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    lines: jsonb("lines").$type<SubmissionLine[]>().notNull(),
    reversesEntryId: uuid("reverses_entry_id"),
    /** "closing" for year-end closing entries, which reports leave out of a year's results. */
    kind: text("kind").notNull().default("standard"),
    status: submissionStatus("status").notNull().default("pending"),
    preparedBy: uuid("prepared_by").notNull().references(() => users.id),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
  },
  (t) => [
    uniqueIndex("journal_submissions_society_idempotency").on(t.societyId, t.idempotencyKey),
    unique("journal_submissions_society_id_id").on(t.societyId, t.id),
    foreignKey({ columns: [t.societyId, t.reversesEntryId], foreignColumns: [journalEntries.societyId, journalEntries.id] }),
    // At most one reversal of an entry can be waiting at a time.
    uniqueIndex("journal_submissions_pending_reversal").on(t.reversesEntryId).where(sql`status = 'pending'`),
    index("journal_submissions_society_status").on(t.societyId, t.status),
    check("journal_submissions_decision", sql`(${t.status} = 'pending') = (${t.decidedBy} is null)`),
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
    /** The loan this line belongs to, on a member loan account (the loan sub-ledger). */
    loanId: uuid("loan_id"),
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
    index("journal_lines_loan").on(t.loanId),
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

/**
 * Invitations for officers to join a society. Only a SHA-256 hash of the link token is
 * stored, so the database alone cannot be used to accept an invitation.
 */
export const officerInvitations = pgTable(
  "officer_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull().references(() => societies.id),
    email: text("email").notNull(),
    roles: text("roles").array().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** Set for member-portal invitations: the member record the new account is tied to. */
    memberId: uuid("member_id"),
    invitedBy: uuid("invited_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
  },
  (t) => [
    index("officer_invitations_society").on(t.societyId),
    check("officer_invitations_has_roles", sql`cardinality(${t.roles}) > 0`),
  ],
);

/**
 * Savings, share and loan products. `policy` is the approved policy in force; a change is
 * held in `proposedPolicy` until an officer other than the proposer approves it.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull().references(() => societies.id),
    kind: productKind("kind").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Member control account the product's balances live on. */
    accountId: uuid("account_id").notNull(),
    /** Loans: where interest and processing fees are credited. */
    incomeAccountId: uuid("income_account_id"),
    status: productStatus("status").notNull().default("proposed"),
    policy: jsonb("policy").$type<Record<string, unknown>>(),
    version: integer("version").notNull().default(0),
    proposedPolicy: jsonb("proposed_policy").$type<Record<string, unknown>>(),
    proposedBy: uuid("proposed_by").references(() => users.id),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_society_code").on(t.societyId, t.code),
    unique("products_society_id_id").on(t.societyId, t.id),
    foreignKey({ columns: [t.societyId, t.accountId], foreignColumns: [ledgerAccounts.societyId, ledgerAccounts.id] }),
    foreignKey({ columns: [t.societyId, t.incomeAccountId], foreignColumns: [ledgerAccounts.societyId, ledgerAccounts.id] }),
    check("products_active_has_policy", sql`${t.status} = 'proposed' or ${t.policy} is not null`),
    check("products_separation_of_duties", sql`${t.approvedBy} is null or ${t.proposedBy} is null or ${t.approvedBy} <> ${t.proposedBy}`),
  ],
);

/** A member's loan, from application to closure. The policy is a snapshot taken at application. */
export const loans = pgTable(
  "loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull().references(() => societies.id),
    loanNo: integer("loan_no").notNull(),
    memberId: uuid("member_id").notNull(),
    productId: uuid("product_id").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    termMonths: integer("term_months").notNull(),
    purpose: text("purpose").notNull(),
    policy: jsonb("policy").$type<Record<string, unknown>>().notNull(),
    policyVersion: integer("policy_version").notNull(),
    status: loanStatus("status").notNull().default("applied"),
    appliedBy: uuid("applied_by").notNull().references(() => users.id),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    disbursementSubmissionId: uuid("disbursement_submission_id"),
    disbursedOn: date("disbursed_on"),
    firstDueDate: date("first_due_date"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("loans_society_loan_no").on(t.societyId, t.loanNo),
    unique("loans_society_id_id").on(t.societyId, t.id),
    foreignKey({ columns: [t.societyId, t.memberId], foreignColumns: [members.societyId, members.id] }),
    foreignKey({ columns: [t.societyId, t.productId], foreignColumns: [products.societyId, products.id] }),
    foreignKey({ columns: [t.societyId, t.disbursementSubmissionId], foreignColumns: [journalSubmissions.societyId, journalSubmissions.id] }),
    index("loans_society_status").on(t.societyId, t.status),
    index("loans_member").on(t.societyId, t.memberId),
    check("loans_amount_positive", sql`${t.amount} > 0`),
    check("loans_term", sql`${t.termMonths} between 1 and 120`),
    check("loans_separation_of_duties", sql`${t.decidedBy} is null or ${t.status} = 'withdrawn' or ${t.decidedBy} <> ${t.appliedBy}`),
  ],
);

export const loanGuarantors = pgTable(
  "loan_guarantors",
  {
    societyId: uuid("society_id").notNull(),
    loanId: uuid("loan_id").notNull(),
    memberId: uuid("member_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.loanId, t.memberId] }),
    foreignKey({ columns: [t.societyId, t.loanId], foreignColumns: [loans.societyId, loans.id] }),
    foreignKey({ columns: [t.societyId, t.memberId], foreignColumns: [members.societyId, members.id] }),
  ],
);

/** A member's standing monthly contribution to a savings or share product. */
export const memberContributions = pgTable(
  "member_contributions",
  {
    societyId: uuid("society_id").notNull(),
    memberId: uuid("member_id").notNull(),
    productId: uuid("product_id").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.productId] }),
    foreignKey({ columns: [t.societyId, t.memberId], foreignColumns: [members.societyId, members.id] }),
    foreignKey({ columns: [t.societyId, t.productId], foreignColumns: [products.societyId, products.id] }),
    check("member_contributions_amount", sql`${t.amount} > 0`),
  ],
);

/**
 * One month's payroll deductions: the schedule sent to the employer, the remittance that came
 * back, how it was allocated, and the journal submission that posts it.
 */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull().references(() => societies.id),
    /** YYYY-MM */
    period: text("period").notNull(),
    status: payrollStatus("status").notNull().default("draft"),
    strategy: text("strategy").notNull(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    receivedOn: date("received_on"),
    submissionId: uuid("submission_id"),
  },
  (t) => [
    uniqueIndex("payroll_runs_society_period").on(t.societyId, t.period),
    unique("payroll_runs_society_id_id").on(t.societyId, t.id),
    foreignKey({ columns: [t.societyId, t.submissionId], foreignColumns: [journalSubmissions.societyId, journalSubmissions.id] }),
    check("payroll_runs_period", sql`${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

export const payrollItems = pgTable(
  "payroll_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull(),
    runId: uuid("run_id").notNull(),
    memberId: uuid("member_id").notNull(),
    kind: payrollItemKind("kind").notNull(),
    productId: uuid("product_id").notNull(),
    loanId: uuid("loan_id"),
    scheduled: bigint("scheduled", { mode: "bigint" }).notNull(),
    /** Set at reconciliation. */
    allocated: bigint("allocated", { mode: "bigint" }),
  },
  (t) => [
    foreignKey({ columns: [t.societyId, t.runId], foreignColumns: [payrollRuns.societyId, payrollRuns.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.societyId, t.memberId], foreignColumns: [members.societyId, members.id] }),
    foreignKey({ columns: [t.societyId, t.productId], foreignColumns: [products.societyId, products.id] }),
    foreignKey({ columns: [t.societyId, t.loanId], foreignColumns: [loans.societyId, loans.id] }),
    index("payroll_items_run").on(t.runId),
    check("payroll_items_scheduled", sql`${t.scheduled} > 0`),
  ],
);

export const payrollRemittanceLines = pgTable(
  "payroll_remittance_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull(),
    runId: uuid("run_id").notNull(),
    line: integer("line").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name"),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    memberId: uuid("member_id"),
  },
  (t) => [
    foreignKey({ columns: [t.societyId, t.runId], foreignColumns: [payrollRuns.societyId, payrollRuns.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.societyId, t.memberId], foreignColumns: [members.societyId, members.id] }),
    index("payroll_remittance_lines_run").on(t.runId),
  ],
);

/** Requests for a demo from the public website. Platform-level: not tied to any society. */
export const demoRequests = pgTable("demo_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  society: text("society").notNull(),
  role: text("role"),
  email: text("email").notNull(),
  phone: text("phone"),
  sector: text("sector"),
  members: text("members"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every email the platform sends, or would send. With no email provider configured, messages are
 * kept here ("logged") for platform staff to forward by hand. Bodies are stored only when a
 * message wasn't delivered, because they can contain sign-in links.
 */
export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    body: text("body"),
    error: text("error"),
    providerId: text("provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbound_messages_created").on(t.createdAt), check("outbound_messages_status", sql`${t.status} in ('sent', 'logged', 'failed')`)],
);

/** A member's request to take money out of a savings product, from request to payment. */
export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull(),
    memberId: uuid("member_id").notNull(),
    productId: uuid("product_id").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    reason: text("reason"),
    requestedOn: date("requested_on").notNull(),
    /** After the product's notice period. */
    earliestPayment: date("earliest_payment").notNull(),
    status: withdrawalStatus("status").notNull().default("requested"),
    requestedBy: uuid("requested_by").notNull().references(() => users.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    paymentSubmissionId: uuid("payment_submission_id"),
  },
  (t) => [
    unique("withdrawals_society_id_id").on(t.societyId, t.id),
    foreignKey({ columns: [t.societyId, t.memberId], foreignColumns: [members.societyId, members.id] }),
    foreignKey({ columns: [t.societyId, t.productId], foreignColumns: [products.societyId, products.id] }),
    foreignKey({ columns: [t.societyId, t.paymentSubmissionId], foreignColumns: [journalSubmissions.societyId, journalSubmissions.id] }),
    index("withdrawals_society_status").on(t.societyId, t.status),
    check("withdrawals_amount_positive", sql`${t.amount} > 0`),
    check("withdrawals_separation_of_duties", sql`${t.status} not in ('approved', 'rejected', 'paying', 'paid') or ${t.decidedBy} <> ${t.requestedBy}`),
  ],
);

/** A closed financial year. While closing, the closing entry awaits approval; once closed, the year is locked. */
export const financialYears = pgTable(
  "financial_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id").notNull().references(() => societies.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").notNull().default("closing"),
    surplus: bigint("surplus", { mode: "bigint" }).notNull(),
    statutoryReserve: bigint("statutory_reserve", { mode: "bigint" }).notNull(),
    submissionId: uuid("submission_id"),
    closedBy: uuid("closed_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("financial_years_society_end").on(t.societyId, t.endDate),
    foreignKey({ columns: [t.societyId, t.submissionId], foreignColumns: [journalSubmissions.societyId, journalSubmissions.id] }),
    check("financial_years_status", sql`${t.status} in ('closing', 'closed', 'abandoned')`),
  ],
);
