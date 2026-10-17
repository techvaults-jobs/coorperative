/**
 * Read-only figures for dashboards and reports, always derived from posted journal
 * entries so they can never disagree with the ledger.
 */
import { can, kobo, type Kobo } from "@techvaults/core";
import { sql } from "drizzle-orm";
import type { Tx } from "../client.js";
import { PermissionError, type Actor } from "./ledger.js";

export interface MonthFlow {
  /** First day of the month, YYYY-MM-01. */
  month: string;
  /** Credits to member savings and share accounts. */
  contributions: Kobo;
  /** Debits to member loan accounts. */
  loansDisbursed: Kobo;
  /** Credits to member loan accounts. */
  loanRepayments: Kobo;
  newMembers: number;
}

/** Month-by-month flows for the `months` months ending with the month of `asOf`. */
export async function monthlyFlows(tx: Tx, actor: Actor, opts: { months?: number; asOf?: string } = {}): Promise<MonthFlow[]> {
  if (!can(actor.roles, "ledger.read")) throw new PermissionError("Your role cannot view the ledger");
  const months = Math.min(Math.max(opts.months ?? 12, 1), 36);
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const rows = await tx.execute<{
    month: string;
    contributions: string;
    loans_disbursed: string;
    loan_repayments: string;
    new_members: number;
  }>(sql`
    with months as (
      select generate_series(
        date_trunc('month', ${asOf}::date) - make_interval(months => ${months - 1}),
        date_trunc('month', ${asOf}::date),
        interval '1 month'
      )::date as month
    ),
    flows as (
      select date_trunc('month', e.entry_date)::date as month,
        sum(l.amount) filter (where a.is_member_control and a.class in ('liability', 'equity') and l.side = 'credit') as contributions,
        sum(l.amount) filter (where a.is_member_control and a.class = 'asset' and l.side = 'debit') as loans_disbursed,
        sum(l.amount) filter (where a.is_member_control and a.class = 'asset' and l.side = 'credit') as loan_repayments
      from journal_lines l
      join journal_entries e on e.id = l.entry_id
      join ledger_accounts a on a.id = l.account_id
      where e.entry_date >= (select min(month) from months)
        and e.entry_date < (select max(month) from months) + interval '1 month'
        and e.reverses_entry_id is null
        and not exists (select 1 from journal_entries r where r.reverses_entry_id = e.id)
      group by 1
    ),
    joins as (
      select date_trunc('month', joined_on)::date as month, count(*)::int as n from members where joined_on is not null group by 1
    )
    select to_char(m.month, 'YYYY-MM-DD') as month,
      coalesce(f.contributions, 0)::text as contributions,
      coalesce(f.loans_disbursed, 0)::text as loans_disbursed,
      coalesce(f.loan_repayments, 0)::text as loan_repayments,
      coalesce(j.n, 0) as new_members
    from months m
    left join flows f on f.month = m.month
    left join joins j on j.month = m.month
    order by m.month
  `);
  return rows.map((r) => ({
    month: r.month,
    contributions: kobo(BigInt(r.contributions)),
    loansDisbursed: kobo(BigInt(r.loans_disbursed)),
    loanRepayments: kobo(BigInt(r.loan_repayments)),
    newMembers: Number(r.new_members),
  }));
}

export interface MemberCounts {
  total: number;
  byStatus: Record<string, number>;
}

export async function memberCounts(tx: Tx, actor: Actor): Promise<MemberCounts> {
  if (!can(actor.roles, "members.read")) throw new PermissionError("Your role cannot view the member register");
  const rows = await tx.execute<{ status: string; n: number }>(sql`select status::text, count(*)::int as n from members group by status`);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  return { total: rows.reduce((s, r) => s + Number(r.n), 0), byStatus };
}

// ---------------------------------------------------------------------------
// Financial statements

export interface AccountLine {
  accountId: string;
  code: string;
  name: string;
  class: "asset" | "liability" | "equity" | "income" | "expense";
  /** Positive on the account's normal side. */
  amount: Kobo;
}

const requireLedger = (actor: Actor) => {
  if (!can(actor.roles, "ledger.read")) throw new PermissionError("Your role cannot view financial reports");
};

async function sumsByAccount(tx: Tx, actor: Actor, from: string | null, to: string): Promise<AccountLine[]> {
  const rows = await tx.execute<{ id: string; code: string; name: string; class: AccountLine["class"]; net: string }>(sql`
    select a.id, a.code, a.name, a.class,
      coalesce(sum(case when l.side = 'debit' then l.amount else -l.amount end), 0)::text as net
    from ledger_accounts a
    left join journal_lines l on l.account_id = a.id
      and l.entry_id in (select e.id from journal_entries e where e.society_id = ${actor.societyId}
                         and e.entry_date <= ${to}::date ${from ? sql`and e.entry_date >= ${from}::date` : sql``})
    where a.society_id = ${actor.societyId}
    group by a.id
    order by a.code
  `);
  return rows.map((r) => {
    const net = BigInt(r.net);
    const debitNormal = r.class === "asset" || r.class === "expense";
    return { accountId: r.id, code: r.code, name: r.name, class: r.class, amount: kobo(debitNormal ? net : -net) };
  });
}

export interface FinancialPosition {
  asOf: string;
  assets: AccountLine[];
  liabilities: AccountLine[];
  equity: AccountLine[];
  /** Income less expenses to date, not yet appropriated. */
  surplus: Kobo;
  totals: { assets: Kobo; liabilities: Kobo; equity: Kobo; liabilitiesAndEquity: Kobo };
  balanced: boolean;
}

/** Statement of financial position (balance sheet) as at a date. */
export async function financialPosition(tx: Tx, actor: Actor, asOf: string): Promise<FinancialPosition> {
  requireLedger(actor);
  const lines = await sumsByAccount(tx, actor, null, asOf);
  const pick = (c: AccountLine["class"]) => lines.filter((l) => l.class === c && l.amount !== 0n);
  const total = (ls: AccountLine[]) => kobo(ls.reduce((s, l) => s + l.amount, 0n));
  const surplus = kobo(total(lines.filter((l) => l.class === "income")) - total(lines.filter((l) => l.class === "expense")));
  const assets = pick("asset");
  const liabilities = pick("liability");
  const equity = pick("equity");
  const t = { assets: total(assets), liabilities: total(liabilities), equity: kobo(total(equity) + surplus) };
  return {
    asOf,
    assets,
    liabilities,
    equity,
    surplus,
    totals: { ...t, liabilitiesAndEquity: kobo(t.liabilities + t.equity) },
    balanced: t.assets === t.liabilities + t.equity,
  };
}

export interface IncomeStatement {
  from: string;
  to: string;
  income: AccountLine[];
  expenses: AccountLine[];
  totals: { income: Kobo; expenses: Kobo; surplus: Kobo };
  /** 25% of a positive surplus to the statutory reserve (Co-operative Societies Act s.34, D-006). */
  statutoryReserve: Kobo;
}

/** Income and expenditure for a period. */
export async function incomeStatement(tx: Tx, actor: Actor, from: string, to: string): Promise<IncomeStatement> {
  requireLedger(actor);
  const lines = await sumsByAccount(tx, actor, from, to);
  const income = lines.filter((l) => l.class === "income" && l.amount !== 0n);
  const expenses = lines.filter((l) => l.class === "expense" && l.amount !== 0n);
  const sum = (ls: AccountLine[]) => kobo(ls.reduce((s, l) => s + l.amount, 0n));
  const surplus = kobo(sum(income) - sum(expenses));
  return {
    from,
    to,
    income,
    expenses,
    totals: { income: sum(income), expenses: sum(expenses), surplus },
    statutoryReserve: kobo(surplus > 0n ? (surplus * 25n + 50n) / 100n : 0n),
  };
}

export interface StatementLine {
  date: string;
  entryNo: bigint;
  description: string;
  debit: Kobo;
  credit: Kobo;
  balance: Kobo;
}

export interface MemberStatementAccount {
  code: string;
  name: string;
  class: AccountLine["class"];
  opening: Kobo;
  lines: StatementLine[];
  closing: Kobo;
}

/** A member's statement for a period: opening balance, every movement, closing balance, per account. */
export async function memberStatement(tx: Tx, actor: Actor, memberId: string, from: string, to: string): Promise<MemberStatementAccount[]> {
  if (!can(actor.roles, "ledger.read") || !can(actor.roles, "members.read")) throw new PermissionError("Your role cannot view member statements");
  const rows = await tx.execute<{
    code: string;
    name: string;
    class: AccountLine["class"];
    entry_date: string;
    entry_no: string;
    description: string;
    side: "debit" | "credit";
    amount: string;
  }>(sql`
    select a.code, a.name, a.class, e.entry_date::text, e.entry_no::text, e.description, l.side, l.amount::text
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join ledger_accounts a on a.id = l.account_id
    where l.member_id = ${memberId} and l.society_id = ${actor.societyId} and e.entry_date <= ${to}::date
    order by a.code, e.entry_date, e.entry_no, l.id
  `);
  const accounts = new Map<string, MemberStatementAccount>();
  for (const r of rows) {
    const acct = accounts.get(r.code) ?? { code: r.code, name: r.name, class: r.class, opening: kobo(0), lines: [], closing: kobo(0) };
    const debitNormal = r.class === "asset" || r.class === "expense";
    const amount = BigInt(r.amount);
    const delta = (r.side === "debit") === debitNormal ? amount : -amount;
    if (r.entry_date < from) acct.opening = kobo(acct.opening + delta);
    else {
      const prev = acct.lines.at(-1)?.balance ?? acct.opening;
      acct.lines.push({
        date: r.entry_date,
        entryNo: BigInt(r.entry_no),
        description: r.description,
        debit: kobo(r.side === "debit" ? amount : 0n),
        credit: kobo(r.side === "credit" ? amount : 0n),
        balance: kobo(prev + delta),
      });
    }
    accounts.set(r.code, acct);
  }
  for (const a of accounts.values()) a.closing = a.lines.at(-1)?.balance ?? a.opening;
  return [...accounts.values()];
}
