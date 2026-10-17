# 6. Competitor Analysis Framework

Vendor marketing is **[REPORTED]** at best. A capability counts as verified only after a demo, a trial account, or a conversation with a current customer.

## 6.1 Initial long-list (found 17 Oct 2026)

| Product | Positioning (vendor's own words, summarised) | Source |
|---|---|---|
| Hyves | Staff cooperatives: payroll deduction, loans, contributions, wallets, bookkeeping | [hyves.ng](https://www.hyves.ng/) |
| Coopra | Members, staff deductions, savings, thrift, loans, repayments, reports; employee-cooperative page | [getcoopra.com](https://getcoopra.com/) |
| TrustCoop | Staff multipurpose cooperatives; offline mode with sync; tiered pricing from about ₦30,000/month for 100 members | [trustcoopapp.com](https://trustcoopapp.com/) |
| Coopify | Cooperatives and agencies; free tier for small groups | [coopify.africa](https://coopify.africa/) |
| Coopco | Cooperative management and accounting; from about ₦15,000/month | [coopco.com.ng](https://coopco.com.ng/) |
| ProbityCoop | Dues reconciliation; cloud, on-premise or SaaS | [probitysoftware.com](https://probitysoftware.com/coop.html) |
| Orbital | Cooperative accounting, loans, payroll module | [orbital.com.ng](https://www.orbital.com.ng/coop.html) |
| FlexiCoop | Cooperative and lending management | [flexicoop.com](https://flexicoop.com/) |
| PRIMAX (and other desktop packages) | Loans, payroll, multi-branch | [Nairaland thread](https://www.nairaland.com/4552775/cooperative-society-management-system) |
| **Excel + WhatsApp** | The real default competitor (hypothesis) | Interviews |
| Generic accounting tools (QuickBooks, Sage, Zoho Books) with spreadsheets | Common in more formal societies (hypothesis) | Interviews |
| Apache Fineract / Mifos X | Open-source core-banking for MFIs and credit unions; a reference model, not a direct competitor | fineract.apache.org |

Add to this list from interviews: ask every society what they have tried and dropped.

## 6.2 Evaluation scorecard

Score each criterion 0–3: 0 = absent, 1 = claimed only, 2 = seen in a demo, 3 = verified in use by a customer. Record the evidence.

| Area | Criteria |
|---|---|
| **Member lifecycle** | Onboarding, custom fields, next of kin, status changes, transfer, exit |
| **Savings** | Multiple schemes, share capital vs savings separation, withdrawal rules, interest on savings |
| **Payroll** | Schedule generation, employer-specific templates, IPPIS or state formats, import of returns, exception handling for short, excess and unknown deductions |
| **Loans** | Product configurability, interest methods, eligibility engine, guarantor exposure tracking, approval chains, top-ups, arrears ageing |
| **Exit and settlement** | Settlement calculator, offset rules, guarantor release, death claims, final statement |
| **Accounting** | True double entry, GL with member sub-ledgers reconciled, bank reconciliation, period close, financial statements, reversals not edits |
| **Dividends** | Reserve appropriation, configurable basis, AGM approval step |
| **Governance and audit** | Role-based permissions, maker-checker, immutable audit log, auditor read-only access |
| **Multi-society** | Multi-tenant, branding, per-tenant configuration, federation or apex reporting |
| **Configurability** | Admin-configurable rules without vendor code changes; versioned policies |
| **Security and privacy** | MFA, encryption, NDPA posture, data residency, breach process, vendor support access controls |
| **Reporting and export** | Standard reports, custom reports, CSV and Excel export, API |
| **Migration and onboarding** | Import tools, opening-balance validation, time to go live |
| **Member mobile experience** | Mobile web or app, USSD, statements, loan application, notifications |
| **Offline and low-bandwidth** | Behaviour on poor connections |
| **Regulatory readiness** | CVN and CoopID fields, state filing outputs |
| **Commercials** | Pricing model (per member, flat, setup fee), contract terms, data exit |
| **Support** | Channels, hours, training, local presence |

## 6.3 Method

1. **Desk scan** (week 2): fill the "claimed" column from websites, brochures and app-store listings.
2. **Demos and trials** (weeks 3–6): request demos for the top 5. Use a **standard scripted scenario** so results are comparable:
   - Onboard a member with 2 schemes; run a month's deductions with 1 short and 1 unknown deduction; issue a reducing-balance loan with 2 guarantors; miss 2 repayments; retire the member with an outstanding loan; produce the trial balance and member statement.
3. **Customer voice** (during interviews): ask societies that use each product what they like, what they work around, and why they would leave.
4. **Synthesis:** a positioning map (configurability vs accounting depth), a gap list backed by evidence, and an April Dunford-style positioning hypothesis: competitive alternatives, unique attributes, value, target customers, market category.

**Rule:** a gap is a gap only if a cooperative suffers from it (interview evidence), not just because a competitor lacks a feature.

## 6.4 Desk scan results (week 0, 17 Oct 2026)

Website claims only. Every non-zero score here is **1 = claimed**, nothing higher. "—" means the site does not mention it. Coopra, FlexiCoop and TrustCoop pages could not be read (no text content or HTTP 404) and need a manual visit.

| Area | Hyves | Coopify | Coopco | ProbityCoop |
|---|---|---|---|---|
| Member lifecycle (onboard → exit) | 1 (profiles, history; no exit) | 1 (enrolment, updates; no exit) | 1 (membership mgmt) | 1 (enrolment, member portal) |
| Savings / share capital separation | 1 (savings; no shares) | 1 (savings; no shares) | 1 (savings, shares, deposits) | 1 (savings, contributions) |
| Payroll deduction + reconciliation | 1 (deduction; no reconciliation) | — | — | 1 ("automated dues reconciliation") |
| Loans: interest methods | — | — | 1 ("control loans & rates") | — |
| Loans: guarantors | — | — | 1 (guarantor verification) | 1 (store context only) |
| Loans: approval chains | — | 1 (admin approval) | — | 1 (online approval) |
| Exit / retirement settlement | — | — | — | — |
| Double-entry GL, bank reconciliation | 1 ("automated ledgers"; no bank rec) | — | 1 (cash book, ledgers, trial balance, balance sheet) | — |
| Dividends / surplus with reserve rule | — | — | — | — |
| Roles + audit trail | 1 (audit trail) | 1 (roles, limits) | 1 (audit trail on top tier) | 1 (Exco/member roles) |
| Multi-society / multi-branch | 1 (multi-branch) | 1 (multi-location) | — | — |
| Member mobile app / USSD | 1 (iOS and Android; no USSD) | 1 (iOS and Android; no USSD) | 1 (custom app) | SMS only |
| Security / NDPA | 1 (generic encryption claim) | 1 (generic) | — | 1 (generic) |
| Migration | 1 (data import) | — | — | — |
| Pricing | Free to start | Free / per-member SaaS / self-host | ₦15k / ₦30k / ₦90k per month | SaaS / enterprise / self-host; 30-day trial |
| Named customers | Vanni Intl Security MPCS; APCAA Greenfields MPCS | None ("500+ cooperatives") | None | SterlingBank Staff Coop; Irorun MPCS; Fidelity Bank Credit MPS |

**Early signals, all [HYPOTHESIS] until demos:**
1. **No vendor publicly claims exit or retirement settlement, or dividend computation with the statutory reserve (Act s.34).** Both may be real gaps. Only interviews can show whether societies suffer from them (A20).
2. **Nobody mentions NDPA compliance or the NCSR (CVN, CoopID).** Regulatory readiness may be a differentiator.
3. **Corporate staff cooperatives (banks) are a proven buyer segment.** ProbityCoop names bank staff cooperatives as customers. This supports the pilot recommendation ([10](10-pilot-selection.md)).
4. **Prices cluster at ₦15k–₦90k per month** for SMB tiers. That is a useful price anchor for the willingness-to-pay test (A3).

**Next:** request demos from Hyves, Coopco and ProbityCoop, plus whichever of Coopra, TrustCoop and FlexiCoop respond, using the standard scenario in §6.3.
