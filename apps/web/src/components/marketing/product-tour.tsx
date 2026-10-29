"use client";

/**
 * An animated tour of Cooperative Vaults for the homepage: a faithful miniature of the app
 * playing scripted journeys (dashboard, loan application, two-officer approval, payroll
 * reconciliation, member portal) with a moving cursor. Drawn on a 1000×620 virtual canvas and
 * scaled to fit. Pauses off screen and on hover; with reduced motion, shows each scene settled.
 * Figures are illustrative.
 */
import {
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  HandCoins,
  LayoutDashboard,
  Search,
  Smartphone,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/brand";
import { cn } from "@/components/ui/cn";

// ---------------------------------------------------------------------------
// Timing helpers

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** Progress 0→1 of an animation starting at `start` ms lasting `dur` ms. */
const prog = (e: number, start: number, dur: number) => easeOut(clamp((e - start) / dur));
const shown = (e: number, start: number) => e >= start;
const naira = (n: number, digits = 0) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const compact = (n: number) => (n >= 1e6 ? `₦${(n / 1e6).toFixed(1)}M` : naira(n));

type Key = [t: number, x: number, y: number, click?: boolean];

/** Cursor position at time e from keyframes, eased between them. */
function cursorAt(keys: Key[], e: number) {
  let prev = keys[0]!;
  for (const k of keys) {
    if (k[0] > e) {
      const t = easeInOut(clamp((e - prev[0]) / (k[0] - prev[0])));
      return { x: prev[1] + (k[1] - prev[1]) * t, y: prev[2] + (k[2] - prev[2]) * t, click: false };
    }
    prev = k;
  }
  return { x: prev[1], y: prev[2], click: false };
}
const clicking = (keys: Key[], e: number) => keys.some((k) => k[3] && e >= k[0] && e < k[0] + 350);

// ---------------------------------------------------------------------------
// Scenes

interface Scene {
  key: string;
  label: string;
  icon: LucideIcon;
  caption: string;
  duration: number;
  nav: string | null;
  cursor: Key[];
  render: (e: number) => React.ReactNode;
}

const NAV: { label: string; icon: LucideIcon }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Members", icon: Users },
  { label: "Loans", icon: HandCoins },
  { label: "Journal", icon: BookOpen },
  { label: "Payroll", icon: FileSpreadsheet },
  { label: "Approvals", icon: ClipboardCheck },
  { label: "Reports", icon: FileBarChart },
];
const navY = (label: string) => 196 + NAV.findIndex((n) => n.label === label) * 34;

function Tile({ label, value, x, y, w = 182 }: { label: string; value: string; x: number; y: number; w?: number }) {
  return (
    <div className="border-border bg-surface absolute rounded-xl border p-3.5 shadow-sm" style={{ left: x, top: y, width: w, height: 84 }}>
      <p className="text-muted text-[11px] font-medium">{label}</p>
      <p className="mt-2 text-[20px] font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

const BARS = [38, 44, 41, 52, 49, 58, 55, 63, 61, 72, 68, 84];
const MONTHS = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];

const dashboard: Scene = {
  key: "dashboard",
  label: "Dashboard",
  icon: LayoutDashboard,
  caption: "Live figures from approved entries: members, savings, shares and loans at a glance.",
  duration: 8000,
  nav: "Overview",
  cursor: [
    [0, 760, 560],
    [2600, 760, 560],
    [3400, 683, 400],
    [5600, 683, 400],
    [6600, 100, navY("Approvals")],
    [8000, 100, navY("Approvals")],
  ],
  render: (e) => {
    const c = prog(e, 250, 1300);
    const hover = e > 3400 && e < 6200;
    return (
      <>
        <p className="text-accent absolute text-[10px] font-semibold tracking-wider uppercase" style={{ left: 24, top: 18 }}>
          Unity Staff Cooperative
        </p>
        <p className="absolute text-[22px] font-semibold tracking-tight" style={{ left: 24, top: 32 }}>
          Good morning, Amaka
        </p>
        <Tile label="Active members" value={Math.round(1248 * c).toLocaleString("en-NG")} x={24} y={78} />
        <Tile label="Members' savings" value={compact(184_600_000 * c)} x={216} y={78} />
        <Tile label="Share capital" value={compact(42_300_000 * c)} x={408} y={78} />
        <Tile label="Loans outstanding" value={compact(96_800_000 * c)} x={600} y={78} />
        <div className="border-border bg-surface absolute rounded-xl border shadow-sm" style={{ left: 24, top: 178, width: 500, height: 268 }}>
          <p className="absolute text-[12px] font-semibold" style={{ left: 16, top: 14 }}>
            Monthly contributions
          </p>
          <p className="text-muted absolute text-[10px]" style={{ left: 16, top: 31 }}>
            Savings and shares credited to members, last 12 months
          </p>
          {[0, 1, 2, 3].map((g) => (
            <div key={g} className="bg-border absolute h-px" style={{ left: 16, right: 16, top: 70 + g * 44 }} />
          ))}
          {BARS.map((h, i) => {
            const p = prog(e, 700 + i * 70, 600);
            const height = h * 1.9 * p;
            return (
              <div key={i}>
                <div
                  className="bg-accent absolute rounded-t-[3px]"
                  style={{ left: 30 + i * 38, width: 20, bottom: 40, height, opacity: hover && i !== 11 ? 0.45 : 1, transition: "opacity 200ms" }}
                />
                <span className="text-subtle absolute text-[9px]" style={{ left: 30 + i * 38, bottom: 22, width: 20, textAlign: "center" }}>
                  {MONTHS[i]}
                </span>
              </div>
            );
          })}
          {hover && (
            <div className="border-border bg-surface absolute rounded-lg border px-2.5 py-1.5 shadow-md" style={{ left: 330, top: 40, opacity: prog(e, 3400, 250) }}>
              <p className="text-muted text-[9px]">October 2026</p>
              <p className="text-[12px] font-semibold tabular-nums">₦18,420,500.00</p>
            </div>
          )}
        </div>
        <div className="border-border bg-surface absolute rounded-xl border p-4 shadow-sm" style={{ left: 536, top: 178, width: 246, height: 268 }}>
          <p className="text-[12px] font-semibold">Member funds</p>
          <div className="mt-4 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {[
              [64, "var(--series-1)"],
              [22, "var(--series-2)"],
              [14, "var(--series-3)"],
            ].map(([w, color], i) => (
              <span key={i} style={{ width: `${(w as number) * prog(e, 1200 + i * 150, 700)}%`, background: color as string }} />
            ))}
          </div>
          {[
            ["Ordinary savings", "₦184.6M", "var(--series-1)"],
            ["Share capital", "₦42.3M", "var(--series-2)"],
            ["Reserves", "₦27.1M", "var(--series-3)"],
          ].map(([l, v, color], i) => (
            <div key={l} className="mt-3 flex items-center justify-between text-[11px]" style={{ opacity: prog(e, 1600 + i * 150, 400) }}>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: color }} />
                {l}
              </span>
              <span className="font-medium tabular-nums">{v}</span>
            </div>
          ))}
          <div className="border-border mt-5 border-t pt-3 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted">Surplus this year</span>
              <span className="font-medium">₦12.9M</span>
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-muted">Statutory reserve (25%)</span>
              <span className="font-medium">₦3.2M</span>
            </div>
          </div>
        </div>
        <div className="border-border bg-surface absolute rounded-xl border shadow-sm" style={{ left: 24, top: 458, width: 758, height: 96 }}>
          <p className="absolute text-[12px] font-semibold" style={{ left: 16, top: 12 }}>
            Recent activity
          </p>
          {[
            ["#352", "October payroll deductions", "₦18,420,500.00"],
            ["#351", "Loan #87 repayment – UNI-0412", "₦26,250.00"],
          ].map(([n, d, a], i) => (
            <div
              key={n}
              className="border-border absolute flex items-center gap-3 border-t text-[11px]"
              style={{ left: 16, right: 16, top: 36 + i * 28, height: 28, opacity: prog(e, 1900 + i * 200, 400), transform: `translateY(${(1 - prog(e, 1900 + i * 200, 400)) * 6}px)` }}
            >
              <span className="text-muted font-mono text-[10px]">{n}</span>
              <span className="flex-1">{d}</span>
              <span className="font-medium tabular-nums">{a}</span>
            </div>
          ))}
        </div>
      </>
    );
  },
};

const CHECKS = ["Member is active", "Member for at least 6 months", "Between ₦10,000 and ₦1,000,000", "At most 3× savings", "Term of 3–24 months", "1 guarantor named"];

function typed(text: string, e: number, start: number, perChar = 70) {
  return text.slice(0, clamp(Math.floor((e - start) / perChar), 0, text.length));
}

const loan: Scene = {
  key: "loan",
  label: "Loan application",
  icon: HandCoins,
  caption: "Every application is checked against your approved rules as it's typed, with the repayment schedule ready.",
  duration: 10500,
  nav: "Loans",
  cursor: [
    [0, 100, navY("Approvals")],
    [600, 100, navY("Loans"), true],
    [1300, 440, 205, true],
    [2000, 336, 321, true],
    [3200, 336, 321],
    [3700, 440, 379, true],
    [6500, 440, 379],
    [7300, 891, 573, true],
    [10500, 891, 573],
  ],
  render: (e) => {
    const field = (x: number, y: number, w: number, label: string, value: string, active: boolean) => (
      <div className="absolute" style={{ left: x, top: y, width: w }}>
        <p className="text-[10px] font-medium">{label}</p>
        <div className={cn("bg-surface mt-1 flex h-8 items-center rounded-lg border px-2.5 text-[11px]", active ? "border-accent ring-accent/20 ring-2" : "border-border")}>
          {value || <span className="text-subtle">Choose…</span>}
          {active && <span className="bg-foreground ml-px h-3.5 w-px animate-pulse" />}
        </div>
      </div>
    );
    const sent = e > 7450;
    return (
      <>
        <p className="text-muted absolute text-[10px]" style={{ left: 24, top: 18 }}>
          ← Loans
        </p>
        <p className="absolute text-[22px] font-semibold tracking-tight" style={{ left: 24, top: 32 }}>
          New loan application
        </p>
        <div className="border-border bg-surface absolute rounded-xl border p-4 shadow-sm" style={{ left: 24, top: 82, width: 430, height: 300 }}>
          <p className="text-[12px] font-semibold">Applicant and product</p>
          {field(16, 34, 398, "Member", shown(e, 1350) ? "UNI-0412 · Chiamaka Eze" : "", e > 1300 && e < 1800)}
          {field(16, 92, 190, "Loan product", "Regular loan", false)}
          {field(16, 150, 190, "Amount requested (₦)", typed("150,000.00", e, 2100, 90), e > 2000 && e < 3300)}
          {field(224, 150, 190, "Term (months)", "12", false)}
          {field(16, 208, 398, "Guarantor 1", shown(e, 3750) ? "UNI-0388 · Babatunde Adeyemi" : "", e > 3700 && e < 4200)}
        </div>
        <div className="border-border bg-surface absolute rounded-xl border p-4 shadow-sm" style={{ left: 470, top: 82, width: 312, height: 238 }}>
          <p className="text-[12px] font-semibold">Eligibility</p>
          <p className="text-muted text-[10px]">{e > 6000 ? "Meets every rule of the product" : e > 2400 ? "Checking…" : "Choose a member and amount"}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {CHECKS.map((c, i) => {
              const at = 2600 + i * 450 + (i === 5 ? 1300 : 0);
              const ok = shown(e, at);
              return (
                <li key={c} className="flex items-center gap-2 text-[11px]" style={{ opacity: ok ? 1 : 0.35 }}>
                  <span
                    className={cn("flex size-4 items-center justify-center rounded-full", ok ? "bg-success text-white" : "border-border border")}
                    style={{ transform: `scale(${ok ? 0.6 + 0.4 * prog(e, at, 250) : 1})` }}
                  >
                    {ok && <Check className="size-2.5" strokeWidth={3} />}
                  </span>
                  {c}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="border-border bg-surface absolute rounded-xl border p-4 shadow-sm" style={{ left: 470, top: 332, width: 312, height: 160, opacity: prog(e, 5600, 500) }}>
          <p className="text-[12px] font-semibold">Repayment</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            {[
              ["Monthly payment", "₦13,327.32"],
              ["Total interest", "₦9,927.84"],
              ["Total repayable", "₦159,927.84"],
              ["Processing fee", "₦1,500.00"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-muted text-[10px]">{k}</p>
                <p className="font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </div>
        <div
          className={cn("bg-accent text-accent-foreground absolute flex items-center justify-center rounded-lg text-[12px] font-semibold", e < 6000 && "opacity-50")}
          style={{ left: 600, top: 504, width: 182, height: 34, transform: clicking([[7300, 0, 0, true]], e) ? "scale(0.97)" : undefined }}
        >
          Record application
        </div>
        {sent && (
          <div
            className="border-success/30 bg-success-soft text-success absolute flex items-center gap-2 rounded-xl border px-4 py-3 text-[12px] font-medium shadow-md"
            style={{ left: 24, top: 400, width: 430, opacity: prog(e, 7450, 300), transform: `translateY(${(1 - prog(e, 7450, 300)) * 8}px)` }}
          >
            <CheckCircle2 className="size-4" />
            Application sent to the loan committee
          </div>
        )}
      </>
    );
  },
};

const approve: Scene = {
  key: "approve",
  label: "Two-officer approval",
  icon: ClipboardCheck,
  caption: "Whoever prepares an entry can never approve it. A second officer reviews it, then it posts.",
  duration: 8500,
  nav: "Approvals",
  cursor: [
    [0, 891, 573],
    [700, 100, navY("Approvals"), true],
    [1800, 260, 300],
    [3000, 307, 325, true],
    [8500, 307, 325],
  ],
  render: (e) => {
    const posted = e > 3200;
    const collapse = prog(e, 3300, 500);
    return (
      <>
        <p className="absolute text-[22px] font-semibold tracking-tight" style={{ left: 24, top: 24 }}>
          Approvals
        </p>
        <p className="text-muted absolute text-[11px]" style={{ left: 24, top: 56 }}>
          Nothing reaches the books until a different officer approves it.
        </p>
        <div
          className="border-border bg-surface absolute overflow-hidden rounded-xl border p-4 shadow-sm"
          style={{ left: 24, top: 88, width: 758, height: 236 * (1 - collapse) + 4, opacity: 1 - collapse }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] font-semibold">Loan #87 disbursement – UNI-0412</p>
              <p className="text-muted text-[10px]">Accounting date 18 Oct 2026 · prepared by Tunde (Treasurer)</p>
            </div>
            <p className="text-[14px] font-semibold tabular-nums">₦150,000.00</p>
          </div>
          <table className="mt-3 w-full text-[11px] tabular-nums">
            <tbody>
              {[
                ["1300 · Members' loans · UNI-0412 Chiamaka Eze", "150,000.00", ""],
                ["1100 · Bank – current account", "", "148,500.00"],
                ["4200 · Interest on loans · Processing fee", "", "1,500.00"],
              ].map(([a, d, c], i) => (
                <tr key={i} className="border-border border-t">
                  <td className={cn("py-1.5", c && "pl-5")}>{a}</td>
                  <td className="w-24 py-1.5 text-right">{d}</td>
                  <td className="w-24 py-1.5 text-right">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex items-center gap-3">
            <span
              className="bg-accent text-accent-foreground flex h-8 items-center rounded-lg px-4 text-[12px] font-semibold"
              style={{ transform: clicking(approve.cursor, e) ? "scale(0.96)" : undefined }}
            >
              Approve and post
            </span>
            <span className="border-border flex h-8 items-center rounded-lg border px-4 text-[12px]">Reject…</span>
            <span className="text-muted ml-auto flex items-center gap-2 text-[10px]">
              <span className="bg-info-soft text-info flex size-6 items-center justify-center rounded-full text-[9px] font-bold">TU</span>
              prepared
              <span className="text-subtle">→</span>
              <span className="bg-gold-soft text-gold flex size-6 items-center justify-center rounded-full text-[9px] font-bold">NG</span>
              approves
            </span>
          </div>
        </div>
        {posted && (
          <div
            className="border-success/30 bg-success-soft text-success absolute flex items-center gap-2 rounded-xl border px-4 py-3 text-[12px] font-medium"
            style={{ left: 24, top: 96, width: 758, opacity: prog(e, 3500, 300) }}
          >
            <CheckCircle2 className="size-4" />
            Approved and posted as entry #353.
          </div>
        )}
        <p className="absolute text-[12px] font-semibold" style={{ left: 24, top: 160 + 190 * (1 - collapse) }}>
          Journal
        </p>
        {[
          ...(posted ? [["#353", "Loan #87 disbursement – UNI-0412", "Tunde → approved by Ngozi", "₦150,000.00", true]] : []),
          ["#352", "October payroll deductions", "Tunde → approved by Ngozi", "₦18,420,500.00", false],
          ["#351", "Loan #64 repayment – UNI-0127", "Tunde → approved by Ngozi", "₦26,250.00", false],
        ].map(([n, d, who, a, fresh], i) => {
          const p = fresh ? prog(e, 3900, 500) : 1;
          return (
            <div
              key={n as string}
              className={cn("border-border bg-surface absolute flex items-center gap-3 rounded-xl border px-4 shadow-sm", fresh && "ring-success/40 ring-2")}
              style={{ left: 24, width: 758, height: 52, top: 184 + 190 * (1 - collapse) + i * 60, opacity: p, transform: `translateY(${(1 - p) * -10}px)` }}
            >
              <span className="text-muted font-mono text-[10px]">{n}</span>
              <div className="flex-1">
                <p className="text-[12px] font-medium">{d}</p>
                <p className="text-muted text-[10px]">{who}</p>
              </div>
              <span className="text-[12px] font-semibold tabular-nums">{a}</span>
            </div>
          );
        })}
      </>
    );
  },
};

const PAY_ROWS: [string, string, string, string, "ok" | "short" | "missing"][] = [
  ["Adaeze Okonkwo", "DS/1001", "₦15,000.00", "₦15,000.00", "ok"],
  ["Babatunde Adeyemi", "DS/1002", "₦17,500.00", "₦17,500.00", "ok"],
  ["Chiamaka Eze", "DS/1003", "₦33,327.32", "₦30,827.32", "short"],
  ["Danjuma Ibrahim", "DS/1004", "₦22,500.00", "₦22,500.00", "ok"],
  ["Efe Oghenekaro", "DS/1005", "₦25,000.00", "₦25,000.00", "ok"],
  ["Funmilayo Ogunleye", "DS/1006", "₦27,500.00", "₦27,500.00", "ok"],
  ["Garba Musa", "DS/1007", "₦30,000.00", "—", "missing"],
];

const payroll: Scene = {
  key: "payroll",
  label: "Payroll reconciliation",
  icon: FileSpreadsheet,
  caption: "Load the employer's file and see every match, shortfall and unknown staff ID before anything posts.",
  duration: 9500,
  nav: "Payroll",
  cursor: [
    [0, 307, 325],
    [700, 100, navY("Payroll"), true],
    [1500, 600, 210],
    [2600, 885, 187, true],
    [9500, 885, 187],
  ],
  render: (e) => {
    const file = prog(e, 1500, 700);
    const loaded = e > 2800;
    return (
      <>
        <p className="absolute text-[22px] font-semibold tracking-tight" style={{ left: 24, top: 24 }}>
          October 2026
        </p>
        <div className="absolute flex gap-1.5" style={{ left: 24, top: 60 }}>
          {["Schedule", "Sent to employer", "Reconcile", "Approve", "Posted"].map((s, i) => {
            const done = i < 2 || (i === 2 && loaded);
            return (
              <span
                key={s}
                className={cn("flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium", done ? "border-success/30 bg-success-soft text-success" : i === 2 ? "border-accent bg-accent-soft text-accent" : "border-border text-muted")}
              >
                {done && <Check className="size-3" />}
                {s}
              </span>
            );
          })}
        </div>
        <div className="border-accent/40 bg-accent-soft/50 absolute flex items-center gap-3 rounded-xl border border-dashed px-4" style={{ left: 24, top: 96, width: 758, height: 76 }}>
          <span className="bg-surface flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] shadow-sm" style={{ opacity: file, transform: `translate(${(1 - file) * -40}px, ${(1 - file) * -20}px) rotate(${(1 - file) * -6}deg)` }}>
            <FileText className="text-accent size-4" />
            employer-remittance-oct-2026.csv
          </span>
          <span className="text-muted text-[11px]">{loaded ? "Loaded: 8 lines, 7 matched, 1 unidentified" : "Drop the employer's file here"}</span>
          <span
            className="bg-accent text-accent-foreground ml-auto flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold"
            style={{ transform: clicking(payroll.cursor, e) ? "scale(0.96)" : undefined }}
          >
            <Upload className="size-3.5" />
            Load and reconcile
          </span>
        </div>
        <div className="border-border bg-surface absolute overflow-hidden rounded-xl border shadow-sm" style={{ left: 24, top: 186, width: 758, height: 320 }}>
          <div className="bg-surface-2 text-muted border-border grid grid-cols-[1.6fr_1fr_1fr_1fr_0.9fr] border-b px-4 py-2 text-[9px] font-semibold tracking-wider uppercase">
            <span>Member</span>
            <span>Staff ID</span>
            <span className="text-right">Scheduled</span>
            <span className="text-right">Remitted</span>
            <span className="pl-4">Result</span>
          </div>
          {PAY_ROWS.map(([name, id, s, r, status], i) => {
            const p = prog(e, 3000 + i * 260, 300);
            return (
              <div
                key={id}
                className={cn("border-border grid grid-cols-[1.6fr_1fr_1fr_1fr_0.9fr] items-center border-b px-4 text-[11px]", status !== "ok" && p > 0.9 && "bg-warning-soft/30")}
                style={{ height: 36, opacity: p, transform: `translateX(${(1 - p) * 12}px)` }}
              >
                <span className="font-medium">{name}</span>
                <span className="font-mono text-[10px]">{id}</span>
                <span className="text-right tabular-nums">{s}</span>
                <span className="text-right tabular-nums">{r}</span>
                <span className="pl-4">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-medium ring-1 ring-inset",
                      status === "ok" ? "bg-success-soft text-success ring-success/20" : status === "short" ? "bg-warning-soft text-warning ring-warning/20" : "bg-danger-soft text-danger ring-danger/20",
                    )}
                  >
                    {status === "ok" ? "Matched" : status === "short" ? "Short" : "Not remitted"}
                  </span>
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-4 text-[11px]" style={{ height: 40, opacity: prog(e, 5200, 400) }}>
            <span>
              Unidentified: <span className="font-mono text-[10px]">DS/9999</span> <span className="text-muted">· held in suspense</span>
            </span>
            <span className="tabular-nums">₦1,500.00</span>
          </div>
        </div>
        <p className="text-muted absolute text-[10px]" style={{ left: 24, top: 516, opacity: prog(e, 5600, 400) }}>
          Shortfall ₦32,500.00 · Unidentified ₦1,500.00 · One entry posts the month once a second officer approves it.
        </p>
      </>
    );
  },
};

const portal: Scene = {
  key: "portal",
  label: "Member portal",
  icon: Smartphone,
  caption: "Members see their own savings, loans and statement on any phone, without visiting the office.",
  duration: 8500,
  nav: null,
  cursor: [
    [0, 885, 187],
    [1500, 560, 420],
    [5600, 560, 420],
    [6400, 500, 577, true],
    [8500, 500, 577],
  ],
  render: (e) => {
    const c = prog(e, 400, 1300);
    return (
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 70% at 50% 40%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%)" }}>
        <div className="border-foreground/80 bg-background absolute overflow-hidden rounded-[34px] border-[7px] shadow-lg" style={{ left: 360, top: 22, width: 280, height: 576 }}>
          <div className="bg-surface border-border flex items-center gap-2 border-b px-4 pt-6 pb-3">
            <LogoMark className="size-5" />
            <span className="text-[11px] font-semibold">Unity Staff Co-op</span>
          </div>
          <div className="flex flex-col gap-2.5 p-3">
            <div className="bg-surface border-border rounded-xl border p-3">
              <p className="text-accent text-[8px] font-semibold tracking-wider uppercase">Member UNI-0623</p>
              <p className="text-[15px] font-semibold">Welcome, Funmilayo</p>
            </div>
            {[
              ["My savings", 275_000],
              ["My shares", 60_000],
            ].map(([l, v]) => (
              <div key={l as string} className="bg-surface border-border rounded-xl border p-3">
                <p className="text-muted text-[9px]">{l}</p>
                <p className="text-[17px] font-semibold tabular-nums">{naira((v as number) * c, 2)}</p>
              </div>
            ))}
            <div className="bg-surface border-border rounded-xl border p-3" style={{ opacity: prog(e, 1600, 400) }}>
              <p className="text-muted text-[9px]">Next loan payment</p>
              <p className="text-[13px] font-semibold">₦10,661.85 · due 31 Oct</p>
              <div className="bg-border mt-2 h-1.5 overflow-hidden rounded-full">
                <div className="bg-accent h-full rounded-full" style={{ width: `${42 * prog(e, 1900, 900)}%` }} />
              </div>
              <p className="text-muted mt-1 text-[8px]">4 of 12 payments made</p>
            </div>
            <div className="bg-surface border-border rounded-xl border p-3">
              <p className="text-[10px] font-semibold">Recent activity</p>
              {[
                ["October deduction", "+₦22,500.00"],
                ["Loan repayment", "−₦10,661.85"],
                ["September deduction", "+₦22,500.00"],
              ].map(([d, a], i) => (
                <div key={d} className="border-border mt-1.5 flex justify-between border-t pt-1.5 text-[9px]" style={{ opacity: prog(e, 2600 + i * 250, 350) }}>
                  <span>{d}</span>
                  <span className="font-medium tabular-nums">{a}</span>
                </div>
              ))}
            </div>
            <div
              className="bg-accent text-accent-foreground flex h-8 items-center justify-center rounded-lg text-[11px] font-semibold"
              style={{ transform: clicking(portal.cursor, e) ? "scale(0.96)" : undefined }}
            >
              Download my statement
            </div>
          </div>
        </div>
      </div>
    );
  },
};

const SCENES = [dashboard, loan, approve, payroll, portal];

// ---------------------------------------------------------------------------
// Player

function usePlayer(count: number, durations: number[], playing: boolean, still: boolean) {
  const [state, setState] = useState({ scene: 0, elapsed: 0 });
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || still) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : Math.min(now - last.current, 100);
      last.current = now;
      setState((s) => {
        const elapsed = s.elapsed + dt;
        return elapsed >= durations[s.scene]! ? { scene: (s.scene + 1) % count, elapsed: 0 } : { scene: s.scene, elapsed };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, still, count, durations]);
  const go = useCallback((scene: number) => setState({ scene, elapsed: 0 }), []);
  return { ...state, go };
}

const DURATIONS = SCENES.map((s) => s.duration);

export function ProductTour() {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => setVisible(entry!.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => {
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener("change", onChange);
    };
  }, []);

  const { scene, elapsed, go } = usePlayer(SCENES.length, DURATIONS, visible && !hovered, reduced);
  const current = SCENES[scene]!;
  // With reduced motion, show each scene settled at its end state.
  const e = reduced ? current.duration : elapsed;
  const scale = width / 1000;
  const cursor = cursorAt(current.cursor, e);
  const isClick = clicking(current.cursor, e);
  const activeNav = current.nav === "Overview" && e > 6600 ? "Approvals" : current.nav;

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border bg-surface overflow-hidden rounded-2xl border p-1.5 shadow-lg" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <div className="bg-surface-2 flex items-center gap-1.5 rounded-t-xl px-3 py-2" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="bg-surface text-subtle mx-auto rounded-md px-3 py-0.5 text-[11px]">Cooperative Vaults · product tour</span>
        </div>
        <div ref={frame} className="relative overflow-hidden rounded-b-xl" style={{ height: 620 * scale }} role="img" aria-label={`Animated preview: ${current.label}. ${current.caption}`}>
          <div className="bg-background absolute top-0 left-0 origin-top-left" style={{ width: 1000, height: 620, transform: `scale(${scale})` }} aria-hidden>
            {current.nav !== null && (
              <>
                {/* Sidebar */}
                <div className="bg-sidebar absolute inset-y-0 left-0" style={{ width: 200 }}>
                  <div className="flex items-center gap-2 px-4 pt-4">
                    <LogoMark tone="inverse" className="size-6" />
                    <span className="text-[12px] font-semibold text-white">Cooperative Vaults</span>
                  </div>
                  <div className="border-sidebar-border bg-sidebar-2 mx-3 mt-4 rounded-lg border p-2.5">
                    <p className="text-sidebar-muted text-[8px] font-semibold tracking-widest uppercase">● Staff & workplace</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-white">Unity Staff Co-op</p>
                    <p className="text-sidebar-muted text-[9px]">Treasurer</p>
                  </div>
                  {NAV.map(({ label, icon: Icon }) => {
                    const active = label === activeNav;
                    return (
                      <div
                        key={label}
                        className={cn("absolute flex items-center gap-2.5 rounded-md px-2.5 text-[11px] transition-colors", active ? "bg-sidebar-2 text-white" : "text-sidebar-foreground")}
                        style={{ left: 10, right: 10, top: navY(label) - 14, height: 28 }}
                      >
                        {active && <span className="bg-sidebar-accent absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full" />}
                        <Icon className={cn("size-3.5", active ? "text-sidebar-accent" : "text-sidebar-muted")} />
                        {label}
                        {label === "Approvals" && (
                          <span className="bg-gold ml-auto rounded-full px-1.5 text-[9px] font-semibold text-white">{current.key === "approve" && e > 3200 ? 0 : 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Top bar */}
                <div className="border-border bg-background absolute flex items-center gap-3 border-b px-4" style={{ left: 200, right: 0, top: 0, height: 52 }}>
                  <div className="border-border bg-surface text-subtle flex h-8 w-72 items-center gap-2 rounded-lg border px-2.5 text-[11px]">
                    <Search className="size-3.5" />
                    Search pages and members…
                    <span className="border-border ml-auto rounded border px-1 text-[9px]">⌘K</span>
                  </div>
                  <span className="bg-accent-soft text-accent ml-auto flex size-7 items-center justify-center rounded-full text-[10px] font-bold">TU</span>
                </div>
              </>
            )}
            {/* Scene content */}
            <div key={current.key} className="absolute" style={current.nav === null ? { inset: 0 } : { left: 200, top: 52, width: 800, height: 568 }}>
              {current.render(e)}
            </div>
            {/* Cursor */}
            {!reduced && (
              <div className="pointer-events-none absolute" style={{ left: cursor.x, top: cursor.y, transform: "translate(-3px, -2px)" }}>
                {isClick && <span className="bg-accent/30 absolute -top-3 -left-3 size-7 animate-ping rounded-full" />}
                <svg width="20" height="22" viewBox="0 0 20 22" className="drop-shadow-md">
                  <path d="M2 1.5 L2 17.5 L6.5 13.3 L9.4 20 L12.4 18.7 L9.6 12.2 L15.6 12.2 Z" fill="white" stroke="#0f1729" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Product tour" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SCENES.map((s, i) => {
          const active = i === scene;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go(i)}
              className={cn(
                "border-border relative flex flex-col items-start gap-1 overflow-hidden rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors",
                active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:bg-surface",
                i === SCENES.length - 1 && "col-span-2 sm:col-span-1",
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon className={cn("size-3.5", active && "text-accent")} aria-hidden />
                {s.label}
              </span>
              <span className="bg-border absolute inset-x-0 bottom-0 h-0.5">
                <span className="bg-accent block h-full" style={{ width: active ? `${(reduced ? 1 : elapsed / s.duration) * 100}%` : "0%" }} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-muted min-h-10 text-center text-sm" aria-live="polite">
        {current.caption}
      </p>
    </div>
  );
}
