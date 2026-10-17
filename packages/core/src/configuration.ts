/**
 * Society configuration: sector profiles, terminology and branding.
 *
 * A sector profile is a starting point, not a rule set. It picks default words for the
 * register and which modules are switched on; each society can change both. Nothing
 * here affects money: financial rules live in approved product policies.
 */

export const SECTORS = ["workplace", "agricultural", "transport", "market", "multipurpose", "credit_union", "housing", "other"] as const;
export type Sector = (typeof SECTORS)[number];

export const MODULES = ["savings", "shares", "loans", "payroll", "levies"] as const;
export type Module = (typeof MODULES)[number];

/** Words a society can change so the register reads the way its members talk. */
export interface Terminology {
  /** What a member's external ID is called: "Staff ID", "Farmer ID", "Stall no." */
  externalId: string;
  /** What groups members: "Department", "Farm cluster", "Route", "Market line" */
  group: string;
  /** What regular payments are called: "Monthly deduction", "Contribution", "Daily levy" */
  contribution: string;
}

export interface SectorProfile {
  label: string;
  description: string;
  terminology: Terminology;
  modules: Module[];
}

export const SECTOR_PROFILES: Record<Sector, SectorProfile> = {
  workplace: {
    label: "Staff & workplace",
    description: "Payroll-deduction societies for companies, universities and public agencies.",
    terminology: { externalId: "Staff ID", group: "Department", contribution: "Monthly deduction" },
    modules: ["savings", "shares", "loans", "payroll"],
  },
  agricultural: {
    label: "Agricultural",
    description: "Farmer groups with seasonal contributions, input loans and produce sales.",
    terminology: { externalId: "Farmer ID", group: "Farm cluster", contribution: "Contribution" },
    modules: ["savings", "shares", "loans", "levies"],
  },
  transport: {
    label: "Transport",
    description: "Drivers' and operators' unions with daily or weekly levies.",
    terminology: { externalId: "Union card no.", group: "Route", contribution: "Daily levy" },
    modules: ["savings", "shares", "loans", "levies"],
  },
  market: {
    label: "Market & traders",
    description: "Thrift and credit circles for market associations.",
    terminology: { externalId: "Stall no.", group: "Market line", contribution: "Thrift contribution" },
    modules: ["savings", "shares", "loans", "levies"],
  },
  multipurpose: {
    label: "Multipurpose",
    description: "Savings, credit, consumer and investment arms under one register.",
    terminology: { externalId: "Member ID", group: "Branch", contribution: "Contribution" },
    modules: ["savings", "shares", "loans", "payroll", "levies"],
  },
  credit_union: {
    label: "Thrift & credit",
    description: "Thrift and credit societies with share capital and dividend cycles.",
    terminology: { externalId: "Member ID", group: "Zone", contribution: "Thrift savings" },
    modules: ["savings", "shares", "loans"],
  },
  housing: {
    label: "Housing",
    description: "Housing and land cooperatives saving towards plots and units.",
    terminology: { externalId: "Member ID", group: "Estate", contribution: "Housing contribution" },
    modules: ["savings", "shares", "loans"],
  },
  other: {
    label: "Other",
    description: "Any other kind of cooperative society.",
    terminology: { externalId: "Member ID", group: "Group", contribution: "Contribution" },
    modules: ["savings", "shares", "loans"],
  },
};

export const MODULE_LABELS: Record<Module, { label: string; description: string }> = {
  savings: { label: "Savings", description: "Ordinary and special savings products" },
  shares: { label: "Share capital", description: "Members' shares within the 1/5 holding cap (Act s.27)" },
  loans: { label: "Loans", description: "Loan products, applications, approval and repayment schedules" },
  payroll: { label: "Payroll deductions", description: "Monthly deduction schedules and employer remittances" },
  levies: { label: "Levies & dues", description: "Recurring dues collected outside payroll" },
};

const TERM_LIMIT = 40;

/** Merge a society's saved words over its sector's defaults, ignoring blanks and over-long values. */
export function resolveTerminology(sector: Sector, saved: Partial<Terminology> | null | undefined): Terminology {
  const base = SECTOR_PROFILES[sector].terminology;
  const pick = (k: keyof Terminology) => {
    const v = saved?.[k]?.trim();
    return v && v.length <= TERM_LIMIT ? v : base[k];
  };
  return { externalId: pick("externalId"), group: pick("group"), contribution: pick("contribution") };
}

export function isModule(value: string): value is Module {
  return (MODULES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Brand colour

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export type BrandCheck = { ok: true; color: string } | { ok: false; reason: string };

/**
 * A brand colour is used for buttons with white text and for links on white, so it must
 * reach 4.5:1 against white (WCAG AA for normal text).
 */
export function checkBrandColor(input: string): BrandCheck {
  const color = input.trim().toLowerCase();
  if (!HEX.test(color)) return { ok: false, reason: "Use a hex colour like #0d7a5f." };
  const ratio = contrastRatio(color, "#ffffff");
  if (ratio < 4.5) {
    return { ok: false, reason: `That colour is too light for white text (contrast ${ratio.toFixed(1)}:1; it needs 4.5:1). Choose a darker shade.` };
  }
  return { ok: true, color };
}

/** Presets that all pass checkBrandColor. */
export const BRAND_PRESETS = [
  { name: "Vault green", color: "#0d7a5f" },
  { name: "Ocean", color: "#1d5fae" },
  { name: "Royal", color: "#5b3fbf" },
  { name: "Harvest", color: "#9a5b12" },
  { name: "Crimson", color: "#b0263a" },
  { name: "Slate", color: "#3c4a5e" },
  { name: "Teal", color: "#0f6f7a" },
  { name: "Forest", color: "#2f6b1f" },
] as const;

// ---------------------------------------------------------------------------
// Starter chart of accounts

export interface ChartAccount {
  code: string;
  name: string;
  class: "asset" | "liability" | "equity" | "income" | "expense";
  memberControl: boolean;
}

const BASE_CHART: ChartAccount[] = [
  { code: "1100", name: "Bank – current account", class: "asset", memberControl: false },
  { code: "1200", name: "Cash in hand", class: "asset", memberControl: false },
  { code: "1300", name: "Members' loans", class: "asset", memberControl: true },
  { code: "2100", name: "Members' ordinary savings", class: "liability", memberControl: true },
  { code: "2900", name: "Unidentified remittances (suspense)", class: "liability", memberControl: false },
  { code: "3100", name: "Members' share capital", class: "equity", memberControl: true },
  { code: "3200", name: "Statutory reserve fund (Act s.34)", class: "equity", memberControl: false },
  { code: "3300", name: "Education fund (Act s.34)", class: "equity", memberControl: false },
  { code: "3900", name: "Opening balances", class: "equity", memberControl: false },
  { code: "4100", name: "Entrance fees", class: "income", memberControl: false },
  { code: "4200", name: "Interest on loans", class: "income", memberControl: false },
  { code: "4900", name: "Other income", class: "income", memberControl: false },
  { code: "5100", name: "Bank charges", class: "expense", memberControl: false },
  { code: "5200", name: "Stationery and printing", class: "expense", memberControl: false },
  { code: "5300", name: "Meetings and AGM expenses", class: "expense", memberControl: false },
  { code: "5400", name: "Audit fees", class: "expense", memberControl: false },
];

const SECTOR_EXTRAS: Partial<Record<Sector, ChartAccount[]>> = {
  agricultural: [
    { code: "4300", name: "Produce marketing commission", class: "income", memberControl: false },
    { code: "5500", name: "Extension and training", class: "expense", memberControl: false },
  ],
  transport: [
    { code: "4300", name: "Levies and dues", class: "income", memberControl: false },
    { code: "5500", name: "Park and union expenses", class: "expense", memberControl: false },
  ],
  market: [{ code: "4300", name: "Levies and dues", class: "income", memberControl: false }],
  housing: [{ code: "2200", name: "Members' housing contributions", class: "liability", memberControl: true }],
  multipurpose: [
    { code: "2200", name: "Members' special savings", class: "liability", memberControl: true },
    { code: "4300", name: "Trading income", class: "income", memberControl: false },
  ],
};

/** A sensible starting chart for a new society of this sector; the society can change it. */
export function starterChart(sector: Sector): ChartAccount[] {
  return [...BASE_CHART, ...(SECTOR_EXTRAS[sector] ?? [])].sort((a, b) => a.code.localeCompare(b.code));
}

/** A URL-safe name for a society, e.g. "Unilag Staff Co-op (Lagos)" → "unilag-staff-co-op-lagos". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "society"
  );
}
