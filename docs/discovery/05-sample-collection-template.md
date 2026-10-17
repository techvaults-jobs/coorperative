# 5. Sample Document Collection Template

## 5.1 Rules for handling documents

1. **Ask for blank forms first.** Most of what we need is in the structure of a form, not its contents.
2. **Where filled examples are necessary** (deduction files, settlement sheets, loan schedules), the society anonymises them **before** handing them over. Replace names with `MEMBER-001`, remove staff IDs, NIN, BVN, account numbers, phone numbers and addresses, and keep amounts and dates. Offer to sit with them while they do it. We never do it ourselves on their machine.
3. **Never accept** documents containing NIN, BVN, bank account numbers, health information or ID images. If received by mistake, delete them, record the deletion, and tell the society. ⚖️ NDPA.
4. Store documents in an access-restricted research folder, not on personal devices or in WhatsApp. Retention: until the end of Stage 3, then delete unless the society consents to longer retention.
5. Every document gets an ID: `DOC-<SocietyID>-<NN>`.
6. Get a signed **document sharing note**: what was shared, the permitted use (research and synthetic test data only), and the retention period.

## 5.2 Request checklist

| Code | Document | Blank or anonymised | Priority | Why we need it |
|---|---|---|---|---|
| D01 | Registration certificate and bye-laws | Public or blank | **Must** | Source of policy rules |
| D02 | Approved policies (loan policy, savings policy, exit policy) | As-is | **Must** | Configurable rules |
| D03 | Membership application form | Blank | **Must** | Member data model |
| D04 | Member register (structure only, or 5 anonymised rows) | Anonymised | Should | Fields and data quality |
| D05 | Deduction authority form | Blank | Should | Consent and employer interface |
| D06 | Monthly payroll deduction schedule sent to employer | Anonymised | **Must** | File format, schedule logic |
| D07 | Employer's returned deduction report and remittance advice | Anonymised | **Must** | Reconciliation logic |
| D08 | Contribution change form | Blank | Could | Workflow |
| D09 | Loan application form | Blank | **Must** | Loan data and eligibility |
| D10 | Guarantor form | Blank | **Must** | Guarantor rules |
| D11 | Loan approval minutes or register | Anonymised | Should | Approval chain |
| D12 | Loan repayment schedule for 2–3 real loans | Anonymised | **Must** | Interest method validation |
| D13 | Loan ageing or arrears report | Anonymised | Should | Recovery workflow |
| D14 | Receipt, payment voucher, cashbook page | Blank, plus one anonymised | Should | Accounting controls |
| D15 | Bank reconciliation statement | Anonymised | Should | Reconciliation design |
| D16 | Trial balance and chart of accounts | As-is (society-level only) | **Must** | Ledger design |
| D17 | Audited financial statements (last 2 years) | As-is (society-level) | **Must** | Reporting outputs, accounting treatment |
| D18 | Auditor's management letter | As-is | Should | Control weaknesses |
| D19 | Dividend or surplus computation | Anonymised | Should | Distribution logic |
| D20 | Retirement or exit settlement sheet (2–3 cases, including one with a loan) | Anonymised | **Must** | Settlement logic |
| D21 | Death claim file checklist | Blank | Could | Next-of-kin process |
| D22 | Member statement | Anonymised | Should | Member UX |
| D23 | Annual returns or filings to the State Department | Blank or as-is | Should | Compliance outputs |
| D24 | NCSR or revalidation forms received | As-is | Should | Regulatory data fields |
| D25 | Screenshots of current software or spreadsheets | Anonymised | Could | Current tooling |

## 5.3 Document intake log (one row per document)

| Field | Example |
|---|---|
| Document ID | DOC-UNI02-12 |
| Society ID / segment / state | UNI02 / A / Oyo |
| D-code | D12 |
| Title as named by society | "Loan Amortisation – Regular Loan" |
| Format | XLSX |
| Received from (role) and date | Treasurer, 2026-11-14 |
| Anonymisation verified by | Researcher initials |
| Contains prohibited data? | No |
| Rules extracted (refs to requirements matrix) | R-LN-014, R-LN-015 |
| Retention end date | End of Stage 3 |
| Notes | Flat interest at 1%/month on original principal; upfront 2% form fee |

## 5.4 Rule-extraction template

For each rule found in a document or interview:

```
Rule ID:        R-<AREA>-<NNN>        (AREA: MEM, SAV, PAY, LN, ACC, DIV, EXIT, GOV)
Statement:      e.g. "Regular loan max = 2 × total ordinary savings, cap ₦5,000,000"
Society / source: UNI02 / DOC-UNI02-02 §4.1   or   [STAKEHOLDER: UNI02 Treasurer]
Evidence level: Document | Demonstrated | Described
Varies across societies? Values seen: UNI02=2×, COR01=3×, MDA01=2× (cap ₦3m)
Candidate classification: Core | Configurable policy | Optional module | Integration | Needs legal/accounting validation
```
