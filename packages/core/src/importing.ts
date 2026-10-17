/**
 * Reading spreadsheets societies bring with them: the member register and opening balances.
 * Everything is validated before anything is saved, and each problem names its line.
 */
import { parseNaira, type Kobo } from "./money.js";
import { parseCsvLine } from "./payroll.js";

export interface ImportIssue {
  line: number;
  message: string;
}

const norm = (h: string) => h.toLowerCase().replace(/[_.]/g, " ").replace(/\s+/g, " ").trim();

function readTable(text: string): { header: string[]; rows: { line: number; cells: string[] }[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? "").map(norm);
  const rows = lines
    .slice(1)
    .map((raw, i) => ({ line: i + 2, raw }))
    .filter((r) => r.raw.trim() && r.raw.replace(/,/g, "").trim())
    .map((r) => ({ line: r.line, cells: parseCsvLine(r.raw) }));
  return { header, rows };
}

const find = (header: string[], names: string[]) => header.findIndex((h) => names.includes(h));

/** DD/MM/YYYY, D/M/YYYY or YYYY-MM-DD → YYYY-MM-DD; null if unreadable. Nigerian files use day first. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Members

export const MEMBER_STATUSES = ["applicant", "active", "suspended", "exiting", "exited", "deceased"] as const;

export interface MemberRow {
  line: number;
  memberNo: string;
  fullName: string;
  externalId: string | null;
  group: string | null;
  phone: string | null;
  email: string | null;
  joinedOn: string | null;
  status: (typeof MEMBER_STATUSES)[number];
}

/** The columns a member file may have; the first two are required. */
export const MEMBER_COLUMNS = ["Member no", "Full name", "External ID", "Group", "Phone", "Email", "Joined", "Status"] as const;

/**
 * Read a member file. `aliases` adds the society's own words for the ID and group columns
 * (e.g. "Union card no", "Faculty or unit") to the common headings recognised.
 */
export function parseMembersCsv(text: string, aliases: { externalId?: string; group?: string } = {}): { rows: MemberRow[]; issues: ImportIssue[] } {
  const { header, rows } = readTable(text);
  const extra = (v?: string) => (v ? [norm(v)] : []);
  const externalNames = [...extra(aliases.externalId), "external id", "staff id", "staff no", "ippis", "ippis no", "farmer id", "union card no", "stall no", "employee id"];
  const col = {
    externalId: find(header, externalNames),
    memberNo: header.findIndex((h, i) => ["member no", "member number", "membership no", "member id", "no"].includes(h) && i !== find(header, externalNames)),
    fullName: find(header, ["full name", "name", "member name"]),
    group: find(header, [...extra(aliases.group), "group", "department", "branch", "unit", "cluster", "farm cluster", "route", "market line", "zone", "estate"]),
    phone: find(header, ["phone", "phone no", "phone number", "mobile", "gsm"]),
    email: find(header, ["email", "email address", "e mail"]),
    joined: find(header, ["joined", "date joined", "joined on", "date of entry", "admission date"]),
    status: find(header, ["status"]),
  };
  if (col.memberNo < 0 || col.fullName < 0) {
    return { rows: [], issues: [{ line: 1, message: "The first row must name at least a “Member no” and a “Full name” column." }] };
  }
  const issues: ImportIssue[] = [];
  const out: MemberRow[] = [];
  const seenNo = new Map<string, number>();
  const seenExt = new Map<string, number>();
  for (const { line, cells } of rows) {
    const get = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const memberNo = get(col.memberNo);
    const fullName = get(col.fullName).replace(/\s+/g, " ");
    const problems: string[] = [];
    if (!memberNo) problems.push("no member number");
    if (fullName.length < 3) problems.push("no full name");
    const email = get(col.email).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`“${email}” isn't an email address`);
    const joinedRaw = get(col.joined);
    const joinedOn = joinedRaw ? parseDate(joinedRaw) : null;
    if (joinedRaw && !joinedOn) problems.push(`“${joinedRaw}” isn't a date (use DD/MM/YYYY)`);
    const statusRaw = get(col.status).toLowerCase() || "active";
    if (!(MEMBER_STATUSES as readonly string[]).includes(statusRaw)) problems.push(`unknown status “${statusRaw}”`);
    const externalId = get(col.externalId);
    if (memberNo && seenNo.has(memberNo.toUpperCase())) problems.push(`member no ${memberNo} also on line ${seenNo.get(memberNo.toUpperCase())}`);
    if (externalId && seenExt.has(externalId.toUpperCase())) problems.push(`ID ${externalId} also on line ${seenExt.get(externalId.toUpperCase())}`);
    if (memberNo) seenNo.set(memberNo.toUpperCase(), line);
    if (externalId) seenExt.set(externalId.toUpperCase(), line);
    if (problems.length) {
      issues.push({ line, message: problems.join("; ") });
      continue;
    }
    out.push({
      line,
      memberNo,
      fullName,
      externalId: externalId || null,
      group: get(col.group) || null,
      phone: get(col.phone) || null,
      email: email || null,
      joinedOn,
      status: statusRaw as MemberRow["status"],
    });
  }
  return { rows: out, issues };
}

// ---------------------------------------------------------------------------
// Opening balances

export interface OpeningBalanceRow {
  line: number;
  memberNo: string;
  /** Account code → amount. */
  amounts: Map<string, Kobo>;
}

/**
 * Read opening balances: a “Member no” column, then one column per account, headed by the
 * account code (e.g. 2100, 3100). Blank cells mean nothing to bring across.
 */
export function parseOpeningBalancesCsv(text: string): { rows: OpeningBalanceRow[]; accountCodes: string[]; issues: ImportIssue[] } {
  const { header, rows } = readTable(text);
  const noCol = find(header, ["member no", "member number", "membership no", "member id", "no"]);
  const accountCols = header.map((h, i) => ({ code: h.match(/^(\d{3,6})\b/)?.[1], i })).filter((c): c is { code: string; i: number } => !!c.code);
  if (noCol < 0 || accountCols.length === 0) {
    return { rows: [], accountCodes: [], issues: [{ line: 1, message: "The first row must have a “Member no” column and at least one account code column, e.g. 2100." }] };
  }
  const issues: ImportIssue[] = [];
  const out: OpeningBalanceRow[] = [];
  const seen = new Map<string, number>();
  for (const { line, cells } of rows) {
    const memberNo = (cells[noCol] ?? "").trim();
    if (!memberNo) {
      issues.push({ line, message: "no member number" });
      continue;
    }
    if (seen.has(memberNo.toUpperCase())) {
      issues.push({ line, message: `member no ${memberNo} also on line ${seen.get(memberNo.toUpperCase())}` });
      continue;
    }
    seen.set(memberNo.toUpperCase(), line);
    const amounts = new Map<string, Kobo>();
    const problems: string[] = [];
    for (const { code, i } of accountCols) {
      const raw = (cells[i] ?? "").trim();
      if (!raw) continue;
      try {
        const k = parseNaira(raw);
        if (k < 0n) problems.push(`${code}: negative amount`);
        else if (k > 0n) amounts.set(code, k);
      } catch {
        problems.push(`${code}: “${raw}” isn't an amount`);
      }
    }
    if (problems.length) issues.push({ line, message: problems.join("; ") });
    else if (amounts.size) out.push({ line, memberNo, amounts });
  }
  return { rows: out, accountCodes: accountCols.map((c) => c.code), issues };
}
