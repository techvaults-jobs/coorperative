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
