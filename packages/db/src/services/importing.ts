/**
 * Bringing a society's existing records across: the member register and opening balances.
 * A preview shows every problem first; the import is all-or-nothing.
 */
import { buildSchedule, can, divideRounded, isFlexible, kobo, loadLoanPolicy, parseLegacyLoansCsv, resolveTerminology, type StoredLoanPolicy, type Terminology, parseMembersCsv, parseOpeningBalancesCsv, type ImportIssue, type JournalLine, type Kobo, type MemberRow } from "@techvaults/core";
import { eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Tx } from "../client.js";
import { journalSubmissions, ledgerAccounts, loans, members, products, societies } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError, submitJournalEntry, type Actor, type Submission } from "./ledger.js";
import { createMember } from "./members.js";

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export interface MemberImportPreview {
  rows: MemberRow[];
  issues: ImportIssue[];
}

/** Check a member file against itself and the register, without saving anything. */
export async function previewMemberImport(tx: Tx, actor: Actor, csv: string): Promise<MemberImportPreview> {
  if (!can(actor.roles, "members.write")) throw new PermissionError("Your role cannot add members");
  const [society] = await tx.select().from(societies).where(eq(societies.id, actor.societyId));
  const terms = resolveTerminology(society!.sector, society!.terminology as Partial<Terminology>);
  const parsed = parseMembersCsv(csv, { externalId: terms.externalId, group: terms.group });
  const existing = await tx.select({ memberNo: members.memberNo, staffId: members.staffId }).from(members).where(eq(members.societyId, actor.societyId));
  const nos = new Set(existing.map((m) => m.memberNo.toUpperCase()));
  const ids = new Set(existing.filter((m) => m.staffId).map((m) => m.staffId!.toUpperCase()));
  const issues = [...parsed.issues];
  const rows: MemberRow[] = [];
  for (const r of parsed.rows) {
    const clash = [
      nos.has(r.memberNo.toUpperCase()) && `member no ${r.memberNo} is already on the register`,
      r.externalId && ids.has(r.externalId.toUpperCase()) && `ID ${r.externalId} already belongs to a member`,
    ].filter(Boolean);
    if (clash.length) issues.push({ line: r.line, message: clash.join("; ") });
    else rows.push(r);
  }
  return { rows, issues: issues.sort((a, b) => a.line - b.line) };
}

/** Add every member in the file, or none: any problem stops the whole import. */
export async function importMembers(tx: Tx, actor: Actor, csv: string): Promise<number> {
  const preview = await previewMemberImport(tx, actor, csv);
  if (preview.issues.length) throw new ImportError(`Fix ${preview.issues.length} line${preview.issues.length === 1 ? "" : "s"} first; nothing was imported.`);
  if (preview.rows.length === 0) throw new ImportError("The file has no members to import.");
  if (preview.rows.length > 20_000) throw new ImportError("Import at most 20,000 members at a time.");
  for (const r of preview.rows) {
    await createMember(tx, actor, {
      memberNo: r.memberNo,
      fullName: r.fullName,
      staffId: r.externalId,
      department: r.group,
      phone: r.phone,
      email: r.email,
      joinedOn: r.joinedOn,
      status: r.status,
    });
  }
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "members.imported",
    entityType: "society",
    entityId: actor.societyId,
    after: { count: preview.rows.length, fileHash: createHash("sha256").update(csv).digest("hex") },
  });
  return preview.rows.length;
}

export const OPENING_BALANCE_CODE = "3900";

export interface OpeningPreview {
  lines: { line: number; memberNo: string; memberName: string; amounts: Record<string, Kobo> }[];
  accounts: { code: string; name: string; total: Kobo }[];
  total: Kobo;
  issues: ImportIssue[];
}

/**
 * Check an opening-balances file: every member must exist and every column must be a member
 * savings or share account (loan balances come across with their loans, not here).
 */
export async function previewOpeningBalances(tx: Tx, actor: Actor, csv: string): Promise<OpeningPreview> {
  if (!can(actor.roles, "ledger.prepare")) throw new PermissionError("Your role cannot prepare journal entries");
  const parsed = parseOpeningBalancesCsv(csv);
  const issues = [...parsed.issues];
  const accounts = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.societyId, actor.societyId));
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  for (const code of parsed.accountCodes) {
    const a = byCode.get(code);
    if (!a) issues.push({ line: 1, message: `There's no account ${code} in the chart of accounts.` });
    else if (!a.isMemberControl || a.class === "asset" || !a.isActive) {
      issues.push({ line: 1, message: `${code} ${a.name} isn't a members' savings or share account. Loan balances come across with their loans.` });
    }
  }
  const people = await tx.select({ id: members.id, memberNo: members.memberNo, fullName: members.fullName }).from(members).where(eq(members.societyId, actor.societyId));
  const byNo = new Map(people.map((p) => [p.memberNo.toUpperCase(), p]));
  const lines: OpeningPreview["lines"] = [];
  for (const r of parsed.rows) {
    const m = byNo.get(r.memberNo.toUpperCase());
    if (!m) {
      issues.push({ line: r.line, message: `member no ${r.memberNo} isn't on the register; import members first` });
      continue;
    }
    lines.push({ line: r.line, memberNo: m.memberNo, memberName: m.fullName, amounts: Object.fromEntries(r.amounts) });
  }
  const totals = new Map<string, bigint>();
  for (const l of lines) for (const [code, amount] of Object.entries(l.amounts)) totals.set(code, (totals.get(code) ?? 0n) + amount);
  return {
    lines,
    accounts: [...totals.entries()].map(([code, total]) => ({ code, name: byCode.get(code)?.name ?? code, total: kobo(total) })),
    total: kobo([...totals.values()].reduce((s, v) => s + v, 0n)),
    issues: issues.sort((a, b) => a.line - b.line),
  };
}

/**
 * Prepare one journal entry bringing members' balances across: each member's account
 * credited, the total debited to 3900 Opening balances. Another officer approves it.
 */
export async function submitOpeningBalances(tx: Tx, actor: Actor, csv: string, asOf: string): Promise<Submission & { members: number; total: Kobo }> {
  const preview = await previewOpeningBalances(tx, actor, csv);
  if (preview.issues.length) throw new ImportError(`Fix ${preview.issues.length} problem${preview.issues.length === 1 ? "" : "s"} first; nothing was prepared.`);
  if (preview.total === 0n) throw new ImportError("The file has no balances to bring across.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new ImportError("Choose the date the balances are as at.");
  const accounts = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.societyId, actor.societyId));
  let opening = accounts.find((a) => a.code === OPENING_BALANCE_CODE);
  if (!opening) {
    [opening] = await tx
      .insert(ledgerAccounts)
      .values({ societyId: actor.societyId, code: OPENING_BALANCE_CODE, name: "Opening balances", class: "equity" })
      .returning();
  }
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const people = await tx.select({ id: members.id, memberNo: members.memberNo }).from(members).where(eq(members.societyId, actor.societyId));
  const idOf = new Map(people.map((p) => [p.memberNo, p.id]));
  const lines: JournalLine[] = [{ accountId: opening!.id, side: "debit", amount: preview.total, memo: "Members' opening balances" }];
  for (const l of preview.lines) {
    for (const [code, amount] of Object.entries(l.amounts)) {
      lines.push({ accountId: byCode.get(code)!.id, side: "credit", amount, memberId: idOf.get(l.memberNo)!, memo: "Opening balance" });
    }
  }
  const key = `opening:${createHash("sha256").update(`${asOf}\n${csv}`).digest("hex").slice(0, 32)}`;
  const submission = await submitJournalEntry(tx, actor, { entryDate: asOf, description: `Members' opening balances as at ${asOf}`, idempotencyKey: key, lines });
  return { ...submission, members: preview.lines.length, total: preview.total };
}

// ---------------------------------------------------------------------------
// Running loans brought across

export interface LegacyLoanPreview {
  loans: { line: number; memberNo: string; memberName: string; productCode: string; outstanding: Kobo; remainingMonths: number; nextDue: string; monthlyPayment: Kobo }[];
  total: Kobo;
  issues: ImportIssue[];
}

/** Check loans to bring across: members and products must exist, and the next due date must be after the date. */
export async function previewLegacyLoans(tx: Tx, actor: Actor, csv: string, asOf: string): Promise<LegacyLoanPreview> {
  if (!can(actor.roles, "ledger.prepare") || !can(actor.roles, "loans.prepare")) throw new PermissionError("Your role cannot bring loans across");
  const parsed = parseLegacyLoansCsv(csv);
  const issues = [...parsed.issues];
  const people = await tx.select().from(members).where(eq(members.societyId, actor.societyId));
  const byNo = new Map(people.map((p) => [p.memberNo.toUpperCase(), p]));
  const prods = await tx.select().from(products).where(eq(products.societyId, actor.societyId));
  const byCode = new Map(prods.map((p) => [p.code, p]));
  const out: LegacyLoanPreview["loans"] = [];
  for (const r of parsed.rows) {
    const m = byNo.get(r.memberNo.toUpperCase());
    const p = byCode.get(r.productCode);
    const problems = [
      !m && `member no ${r.memberNo} isn't on the register`,
      m && m.status !== "active" && `member ${r.memberNo} isn't active`,
      (!p || p.kind !== "loan") && `there's no loan product ${r.productCode}`,
      p && p.kind === "loan" && (p.status !== "active" || !p.policy) && `loan product ${r.productCode} isn't approved`,
      r.nextDue <= asOf && `next due date ${r.nextDue} must be after ${asOf}`,
    ].filter((x): x is string => !!x);
    if (problems.length) {
      issues.push({ line: r.line, message: problems.join("; ") });
      continue;
    }
    const policy = loadLoanPolicy(p!.policy as unknown as StoredLoanPolicy);
    // Flexible weekly loans have no schedule: show the principal expected over a month instead.
    const monthlyPayment = isFlexible(policy.interestMethod)
      ? kobo(divideRounded(r.outstanding, BigInt(r.remainingMonths), "up"))
      : buildSchedule(r.outstanding, r.remainingMonths, policy.interestMethod, policy.annualRateBps, r.nextDue).instalments[0]!.payment;
    out.push({ line: r.line, memberNo: m!.memberNo, memberName: m!.fullName, productCode: r.productCode, outstanding: r.outstanding, remainingMonths: r.remainingMonths, nextDue: r.nextDue, monthlyPayment });
  }
  return { loans: out, total: kobo(out.reduce((s, l) => s + l.outstanding, 0n)), issues: issues.sort((a, b) => a.line - b.line) };
}

/**
 * Bring running loans across: each becomes a loan on its product (remaining balance over the
 * remaining months, under the product's approved terms), and one journal entry against 3900
 * Opening balances carries the balances. The loans go live when another officer approves it.
 */
export async function submitLegacyLoans(tx: Tx, actor: Actor, csv: string, asOf: string): Promise<{ submissionId: string; loans: number; total: Kobo }> {
  const preview = await previewLegacyLoans(tx, actor, csv, asOf);
  if (preview.issues.length) throw new ImportError(`Fix ${preview.issues.length} problem${preview.issues.length === 1 ? "" : "s"} first; nothing was brought across.`);
  if (preview.loans.length === 0) throw new ImportError("The file has no loans to bring across.");
  const key = `legacy-loans:${createHash("sha256").update(`${asOf}\n${csv}`).digest("hex").slice(0, 32)}`;
  const [already] = await tx.select({ id: journalSubmissions.id }).from(journalSubmissions).where(eq(journalSubmissions.idempotencyKey, key));
  if (already) throw new ImportError("This file has already been brought across.");

  const accounts = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.societyId, actor.societyId));
  let opening = accounts.find((a) => a.code === OPENING_BALANCE_CODE);
  if (!opening) {
    [opening] = await tx.insert(ledgerAccounts).values({ societyId: actor.societyId, code: OPENING_BALANCE_CODE, name: "Opening balances", class: "equity" }).returning();
  }
  const prods = new Map((await tx.select().from(products).where(eq(products.societyId, actor.societyId))).map((p) => [p.code, p]));
  const people = new Map((await tx.select().from(members).where(eq(members.societyId, actor.societyId))).map((p) => [p.memberNo, p]));
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`loans:${actor.societyId}`}, 0))`);
  const [{ next }] = (await tx.execute<{ next: number }>(sql`select coalesce(max(loan_no), 0) + 1 as next from loans where society_id = ${actor.societyId}`)) as unknown as [{ next: number }];
  const created: { id: string; memberId: string; accountId: string; amount: Kobo }[] = [];
  for (const [i, l] of preview.loans.entries()) {
    const p = prods.get(l.productCode)!;
    const m = people.get(l.memberNo)!;
    const [row] = await tx
      .insert(loans)
      .values({
        societyId: actor.societyId,
        loanNo: Number(next) + i,
        memberId: m.id,
        productId: p.id,
        amount: l.outstanding,
        termMonths: l.remainingMonths,
        purpose: "Brought across from previous records",
        policy: p.policy!,
        policyVersion: p.version,
        status: "disbursing",
        appliedBy: actor.userId,
        disbursedOn: asOf,
        firstDueDate: l.nextDue,
      })
      .returning({ id: loans.id });
    created.push({ id: row!.id, memberId: m.id, accountId: p.accountId, amount: l.outstanding });
  }
  const lines: JournalLine[] = [
    ...created.map((c) => ({ accountId: c.accountId, side: "debit" as const, amount: c.amount, memberId: c.memberId, loanId: c.id, memo: "Loan brought across" })),
    { accountId: opening!.id, side: "credit", amount: preview.total, memo: "Members' loans brought across" },
  ];
  const submission = await submitJournalEntry(tx, actor, { entryDate: asOf, description: `Running loans brought across as at ${asOf}`, idempotencyKey: key, lines });
  await tx.update(loans).set({ disbursementSubmissionId: submission.id }).where(inArray(loans.id, created.map((c) => c.id)));
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "loans.brought_across",
    entityType: "society",
    entityId: actor.societyId,
    after: { loans: created.length, total: preview.total, submissionId: submission.id },
  });
  return { submissionId: submission.id, loans: created.length, total: preview.total };
}
