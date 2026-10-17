/**
 * Society settings: profile, sector, words, branding, modules and the chart of accounts.
 * Every change is audited with what it was before and after.
 */
import {
  can,
  checkBrandColor,
  isModule,
  resolveTerminology,
  SECTOR_PROFILES,
  SECTORS,
  type AccountClass,
  type Module,
  type Sector,
  type Terminology,
} from "@techvaults/core";
import { asc, eq } from "drizzle-orm";
import type { Tx } from "../client.js";
import { ledgerAccounts, societies } from "../schema.js";
import { recordAudit } from "./audit.js";
import { PermissionError, type Actor } from "./ledger.js";

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

export interface SocietySettings {
  id: string;
  name: string;
  shortName: string | null;
  slug: string;
  state: string;
  registrar: string;
  registrationNumber: string | null;
  cvn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  sector: Sector;
  brandColor: string | null;
  financialYearStart: number;
  /** Saved overrides only. */
  terminologyOverrides: Partial<Terminology>;
  /** Overrides merged over the sector defaults. */
  terminology: Terminology;
  /** Modules in effect (saved list, or the sector's defaults). */
  modules: Module[];
  modulesCustomised: boolean;
}

/** The society in scope. Every officer can read it; the app needs it to label and theme pages. */
export async function getSocietySettings(tx: Tx, actor: Actor): Promise<SocietySettings> {
  const [s] = await tx.select().from(societies).where(eq(societies.id, actor.societyId));
  if (!s) throw new SettingsError("Society not found");
  const overrides = s.terminology as Partial<Terminology>;
  const modules = s.modules ? s.modules.filter(isModule) : SECTOR_PROFILES[s.sector].modules;
  return {
    id: s.id,
    name: s.name,
    shortName: s.shortName,
    slug: s.slug,
    state: s.state,
    registrar: s.registrar,
    registrationNumber: s.registrationNumber,
    cvn: s.cvn,
    address: s.address,
    phone: s.phone,
    email: s.email,
    sector: s.sector,
    brandColor: s.brandColor,
    financialYearStart: s.financialYearStart,
    terminologyOverrides: overrides,
    terminology: resolveTerminology(s.sector, overrides),
    modules,
    modulesCustomised: s.modules !== null,
  };
}

export interface SettingsChanges {
  name?: string;
  shortName?: string | null;
  registrationNumber?: string | null;
  cvn?: string | null;
  state?: string;
  registrar?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  financialYearStart?: number;
  sector?: string;
  brandColor?: string | null;
  terminology?: Partial<Terminology>;
  /** Null returns to the sector defaults. */
  modules?: string[] | null;
}

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);

/** Apply settings changes. Only fields present in `changes` are touched. */
export async function updateSocietySettings(tx: Tx, actor: Actor, changes: SettingsChanges): Promise<SocietySettings> {
  if (!can(actor.roles, "settings.manage")) throw new PermissionError("Your role cannot change society settings");
  const before = await getSocietySettings(tx, actor);
  const set: Partial<typeof societies.$inferInsert> = {};

  if (changes.name !== undefined) {
    if (changes.name.trim().length < 3) throw new SettingsError("Enter the society's registered name.");
    set.name = changes.name.trim();
  }
  for (const key of ["shortName", "registrationNumber", "cvn", "address", "phone"] as const) {
    if (changes[key] !== undefined) set[key] = blankToNull(changes[key]);
  }
  if (changes.state !== undefined) {
    if (!changes.state.trim()) throw new SettingsError("Enter the state the society is registered in.");
    set.state = changes.state.trim();
  }
  if (changes.registrar !== undefined) {
    if (!changes.registrar.trim()) throw new SettingsError("Enter the registering Director of Co-operatives.");
    set.registrar = changes.registrar.trim();
  }
  if (changes.email !== undefined) {
    const email = blankToNull(changes.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SettingsError("Enter a valid email address or leave it blank.");
    set.email = email;
  }
  if (changes.financialYearStart !== undefined) {
    if (!Number.isInteger(changes.financialYearStart) || changes.financialYearStart < 1 || changes.financialYearStart > 12) {
      throw new SettingsError("Choose the month the financial year starts.");
    }
    set.financialYearStart = changes.financialYearStart;
  }
  if (changes.sector !== undefined) {
    if (!(SECTORS as readonly string[]).includes(changes.sector)) throw new SettingsError("Choose a sector from the list.");
    set.sector = changes.sector as Sector;
  }
  if (changes.brandColor !== undefined) {
    if (changes.brandColor === null || !changes.brandColor.trim()) set.brandColor = null;
    else {
      const check = checkBrandColor(changes.brandColor);
      if (!check.ok) throw new SettingsError(check.reason);
      set.brandColor = check.color;
    }
  }
  if (changes.terminology !== undefined) {
    const t: Record<string, string> = {};
    for (const key of ["externalId", "group", "contribution"] as const) {
      const v = changes.terminology[key]?.trim();
      if (v && v.length > 40) throw new SettingsError("Keep each word or phrase under 40 characters.");
      if (v) t[key] = v;
    }
    set.terminology = t;
  }
  if (changes.modules !== undefined) {
    if (changes.modules === null) set.modules = null;
    else {
      const unknown = changes.modules.filter((m) => !isModule(m));
      if (unknown.length) throw new SettingsError(`Unknown module: ${unknown.join(", ")}`);
      if (changes.modules.length === 0) throw new SettingsError("Keep at least one module switched on.");
      set.modules = [...new Set(changes.modules)];
    }
  }
  if (Object.keys(set).length === 0) return before;

  await tx.update(societies).set(set).where(eq(societies.id, actor.societyId));
  const after = await getSocietySettings(tx, actor);
  const keys = Object.keys(set) as (keyof SocietySettings & keyof typeof set)[];
  const pick = (s: SocietySettings) => Object.fromEntries(keys.map((k) => [k, k === "terminology" ? s.terminologyOverrides : k === "modules" ? (s.modulesCustomised ? s.modules : null) : s[k]]));
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "society.settings_changed",
    entityType: "society",
    entityId: actor.societyId,
    before: pick(before),
    after: pick(after),
  });
  return after;
}

// ---------------------------------------------------------------------------
// Chart of accounts

export type LedgerAccountRow = typeof ledgerAccounts.$inferSelect;

export async function listChartOfAccounts(tx: Tx, actor: Actor): Promise<LedgerAccountRow[]> {
  if (!can(actor.roles, "accounts.manage") && !can(actor.roles, "ledger.read")) throw new PermissionError("Your role cannot view the chart of accounts");
  return tx.select().from(ledgerAccounts).orderBy(asc(ledgerAccounts.code));
}

const CLASS_BY_FIRST_DIGIT: Record<string, AccountClass> = { "1": "asset", "2": "liability", "3": "equity", "4": "income", "5": "expense" };

export async function createAccount(
  tx: Tx,
  actor: Actor,
  input: { code: string; name: string; class: AccountClass; isMemberControl?: boolean },
): Promise<LedgerAccountRow> {
  if (!can(actor.roles, "accounts.manage")) throw new PermissionError("Your role cannot change the chart of accounts");
  const code = input.code.trim();
  if (!/^\d{3,6}$/.test(code)) throw new SettingsError("Account codes are 3 to 6 digits, e.g. 2150.");
  const expected = CLASS_BY_FIRST_DIGIT[code[0]!];
  if (expected && expected !== input.class) {
    throw new SettingsError(`Codes starting with ${code[0]} are ${expected} accounts in this chart. Use a matching code or type.`);
  }
  if (input.name.trim().length < 3) throw new SettingsError("Give the account a descriptive name.");
  if (input.isMemberControl && !["asset", "liability", "equity"].includes(input.class)) {
    throw new SettingsError("Only asset, liability and equity accounts can hold member balances.");
  }
  let row: LedgerAccountRow | undefined;
  try {
    [row] = await tx
      .insert(ledgerAccounts)
      .values({ societyId: actor.societyId, code, name: input.name.trim(), class: input.class, isMemberControl: !!input.isMemberControl })
      .returning();
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new SettingsError(`Account code ${code} is already in use.`);
    throw e;
  }
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: "account.created",
    entityType: "ledger_account",
    entityId: row!.id,
    after: { code, name: row!.name, class: row!.class, isMemberControl: row!.isMemberControl },
  });
  return row!;
}

/** Deactivated accounts keep their history but can't be used in new entries. */
export async function setAccountActive(tx: Tx, actor: Actor, accountId: string, active: boolean): Promise<void> {
  if (!can(actor.roles, "accounts.manage")) throw new PermissionError("Your role cannot change the chart of accounts");
  const [row] = await tx.update(ledgerAccounts).set({ isActive: active }).where(eq(ledgerAccounts.id, accountId)).returning();
  if (!row) throw new SettingsError("Account not found.");
  await recordAudit(tx, {
    societyId: actor.societyId,
    actorId: actor.userId,
    action: active ? "account.reactivated" : "account.deactivated",
    entityType: "ledger_account",
    entityId: accountId,
    after: { code: row.code, name: row.name },
  });
}
