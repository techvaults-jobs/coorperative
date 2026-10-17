# 11. UX and UI Direction (Provisional)

**Status:** [RECOMMENDATION], provisional. The master prompt (§10) says not to fix the technology stack before requirements are documented. This document records the **design direction** and a **preferred UI toolkit** so prototypes in weeks 10–11 can be built with components we expect to keep. Confirm in Stage 4.

## 11.1 What "premium" means for this product

A cooperative platform feels expensive when it feels **trustworthy, calm and exact**, not when it is decorated. The Linear and Stripe reference points:

- **Numbers are the hero.** Tabular (monospaced) figures, right-aligned amounts, consistent ₦ formatting, negative values that cannot be misread, and every balance one click from its breakdown ("How was this calculated?").
- **Restraint.** A neutral palette, one brand accent, generous spacing on member screens and dense layouts on accountant screens. Colour carries status (posted, pending, reversed, overdue), never decoration.
- **Speed you can feel.** Instant navigation, optimistic UI only where it is safe (never for posting money), a command palette (⌘K) for officers, and keyboard-first workflows for treasurers.
- **Every state designed.** Loading skeletons, empty states that teach, errors that say what to do next, permission-denied states that name who can help, and reconciliation warnings that cannot be ignored.
- **Explainability.** Approval chains, policy versions and audit history are visible in context: "Approved by Treasurer, 12 Nov · Policy v3".
- **Inclusive by default.** WCAG 2.2 AA, 16px+ body text on mobile, large touch targets, plain English (with Yoruba, Hausa and Igbo localisation if discovery supports it), and graceful behaviour on slow 3G and older Android phones.

## 11.2 Preferred UI toolkit (assuming React + TypeScript, to be confirmed in Stage 4)

| Need | Choice | Why |
|---|---|---|
| Component foundation | **shadcn/ui** on **Radix UI** primitives | We own the source (copied into the repo, not a black-box dependency), accessible primitives, full design control, the industry-standard look Linear and Vercel users expect |
| Styling | **Tailwind CSS** with design tokens as CSS variables | Consistent spacing and type scale; per-tenant branding by swapping tokens; light and dark themes |
| Data tables (ledgers, registers, schedules) | **TanStack Table** + **TanStack Virtual** | Headless, so it fits shadcn styling; sorting, filtering, grouping, column pinning; virtualises 10k+ rows |
| Spreadsheet-grade grids (reconciliation, bulk deduction edits) | **AG Grid** (evaluate Community vs Enterprise) | Excel-like keyboard editing, range selection, clipboard paste. Only where treasurers truly need spreadsheet behaviour. |
| Forms and validation | **React Hook Form** + **Zod** | Long multi-step forms (membership, loans) with schema validation shared with the API |
| Server state | **TanStack Query** | Caching, retries, background refresh, good offline-tolerant behaviour |
| Charts | **Recharts** via shadcn chart components (or **Tremor** for dashboard blocks) | Consistent with the design system; enough for portfolio, arrears and contribution trends |
| Command palette | **cmdk** | ⌘K to find a member, loan or report instantly |
| Notifications | **Sonner** | Quiet, stackable toasts |
| Date inputs | **react-day-picker** (shadcn Calendar) | Accessible; supports payroll-month pickers |
| Icons | **Lucide** | Consistent stroke icons, tree-shakeable |
| Motion | **Motion** (formerly Framer Motion), used sparingly | Micro-interactions (approve, post, reconcile) that confirm state changes; respects reduced-motion |
| Typography | **Inter** or **Geist** with `font-variant-numeric: tabular-nums` for money | Legible at small sizes; aligned figures |
| Money in the UI | `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })` for display; a decimal library (e.g. **decimal.js** or **dinero.js**) for any client-side arithmetic | Never use JavaScript floats for money; authoritative calculations stay on the server |
| Component workshop | **Storybook** with accessibility add-on + visual regression | Every component documented in all states before it is used in a screen |

**Deliberately not chosen:** heavy all-in-one kits (MUI, Ant Design) as the base, because their look is hard to make distinctive and they carry large bundles. Ant Design's table and form patterns are still worth studying for enterprise data entry.

## 11.3 Signature custom components to design

Discovery should validate these. They are where TechVaults can be visibly better than competitors.

1. **Balance card with breakdown**: share capital, savings by scheme, loans, guarantees given, net position; each line expandable to its transactions.
2. **Deduction reconciliation workbench**: expected vs received per member, with exception buckets (short, zero, excess, unknown, duplicate), bulk resolution and a running variance that must reach zero before close.
3. **Loan eligibility explainer**: a checklist-style view showing each rule, the member's value and pass or fail, so officers and members understand a decision.
4. **Guarantor exposure view**: who guarantees whom, how much, and what is at risk.
5. **Approval timeline**: maker-checker steps with actor, time, comment and policy version.
6. **Exit settlement calculator**: a step-by-step statement (savings + shares + dividends − loans − pending items = payable or shortfall), with the clearances checklist.
7. **Audit trail drawer**: for any record, who changed what and when, before and after; read-only for auditors.
8. **Policy editor with preview**: change a parameter, see the effect on sample members before submitting for approval, and see the effective date.

## 11.4 Two experiences, one design system

- **Officer console (desktop-first, responsive):** dense tables, keyboard shortcuts, side panels, bulk actions, export everywhere.
- **Member app (mobile-first PWA; USSD and SMS considered in discovery):** balances, statements, loan application and status, guarantor requests to accept or decline, and notifications. Performance budget: interactive in under 3s on a mid-range Android over 3G (to be validated).

## 11.5 How design runs during discovery

- Weeks 3–7: designers attend interviews and collect real screenshots and spreadsheets (anonymised). Real layouts beat assumptions.
- Weeks 8–9: low-fidelity flows for the 3 critical journeys.
- Weeks 10–11: high-fidelity clickable prototypes built with the toolkit above (Figma, or coded prototypes using shadcn/ui), tested with officers and members.
- Output: a design-principles page, a token set (colour, type, spacing, radius, elevation), and a component inventory for Stage 4.
