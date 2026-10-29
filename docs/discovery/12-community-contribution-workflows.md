# 12. Community Contribution Workflows

**Status:** [RECOMMENDATION], 29 October 2026. This is the design of the workflows Cooperative Vaults will offer to community, thrift and market societies. It is based on the **COMMUNITY CONTRIBUTION.xlsx** workbook that TechVaults shared. Societies adopting the product will start from that workbook.
**Source:** the workbook (6 sheets, 132 card slots, cut-over date 8 April 2025). Member names and balances stay in the workbook. This document quotes only structure and totals.
**Decisions:** D-027 to D-030 in [decisions.md](decisions.md).

> Design rule: keep what officers already do (one card number, one weekly sheet, five money columns per member) and remove what the spreadsheet makes fragile (hand-typed dates, copied columns, formulas that must be edited every month, a hand-kept list of bad loans).

## 12.1 How the workbook works today

| Sheet | What it holds | How it is used |
|---|---|---|
| **Sheet1, "Weekly contributions record"** | A blank form: *Week end date*, then per card: **Saving, Loan, Share, Buildin, Int. due** | The collector's sheet for the weekly meeting |
| **SUMMARY** | Per member: opening balances at 8 Apr 2025, then 5 columns per week (Apr: 1, 8, 15, 21, 28; May: 5, 12, 19, 27), then updated totals | The master ledger. **Total asset** = savings + share + building. **Loan updated** = outstanding − weekly loan repayments |
| **WEEKLY SAVING** | Opening savings + weekly saving columns → *Saving update*; repeats share, building, loan, outstanding | Savings ledger |
| **SHARE** | The same layout for share capital | Share ledger |
| **LOAN ACCOUNT** | Principal granted, outstanding at cut-over, weekly repayments → *Loan outstanding update*; **Net loan** = granted − outstanding; **non-performing** and **performing** totals | Loan ledger and portfolio quality |
| **INTREST ACCOUNT** | Per loan: interest = **1.5% × updated outstanding**, one column per month | Monthly interest charge |

Opening position at cut-over (totals only): 80 members in use out of 132 card numbers. Savings ₦20.15m, share capital ₦0.82m, building fund ₦0.44m. 56 loans: ₦33.99m granted, ₦22.63m outstanding, of which ₦5.44m is on 19 loans marked non-performing.

### What the members hold

```
Member (card no.)
├── Ordinary savings     weekly, withdrawable under rules
├── Share capital        weekly, not withdrawable while a member
├── Building fund        weekly, a designated savings scheme
└── Loan                 principal, repaid weekly in any amount
      └── Interest       1.5% of the outstanding balance each month, paid weekly in the "Int. due" column
```

## 12.2 What the spreadsheet gets wrong (and the system must fix)

| # | Problem found in the workbook | Consequence | How the system fixes it |
|---|---|---|---|
| P1 | Week dates are mixed: some are real dates with day and month swapped (1 Apr is stored as 4 Jan, 12 May as 5 Dec), others are text ("15/4/25") | Nothing can be sorted or filtered by date; reports by month are unreliable | Weeks are generated from a meeting calendar (e.g. every Monday). No date is ever typed. |
| P2 | Totals formulas name the week columns. *Saving update* covers only the five April columns, not May | Each new month needs formula edits. A missed edit silently leaves out money | Balances come from the ledger. Every posted week counts automatically. |
| P3 | The share, building and loan columns are copied onto every sheet | Copies drift. One loan has ₦359,000 outstanding on the Loan sheet but a blank on the Weekly sheet | One record per member account. Every screen and report reads the same balance. |
| P4 | Non-performing loans are a hand-typed list of 19 row numbers | It goes stale, and sorting the sheet breaks it | Loans are classified automatically by how long since the last repayment (W6). |
| P5 | Interest is charged (Interest sheet) but the interest paid (*Int. due*) is never compared with it | Unpaid interest disappears. There are no interest arrears | Interest charged and paid sit on the member's loan. Arrears show on the next collection sheet. |
| P6 | Loans have only *granted* and *outstanding*: no grant date, term, guarantors or expected weekly payment | "Late" is a matter of opinion | Each loan carries its product terms, grant date, guarantors and an expected weekly repayment. |
| P7 | Nothing records who collected, how much cash was handed over, or what was banked | No cash control. Shortages can't be traced | The collection sheet total must match the cash counted and the bank lodgement. Any difference goes to suspense, with a named officer. |
| P8 | Anyone can overwrite any cell. There is no history | Errors and fraud can't be detected | Maker-checker on every posting (D-015) and an append-only audit trail. |
| P9 | Mislabelled totals: SUMMARY's "Net loan" row adds up assets, and one cell mixes a savings total with weekly columns | Committee reports can mislead | Reports are fixed, tested definitions with "how was this calculated?" breakdowns. |
| P10 | Card slots with no member (52 of 132) sit inside the totals | Clutter, and counts are wrong | Card numbers are member numbers. Unused numbers simply don't exist. |

## 12.3 The workflows

Actors: **Collector** (whoever runs the weekly meeting or receives transfers), **Treasurer**, **Secretary**, **Chairperson / second approver**, **Loan committee**, **Member**.
Every posting is prepared by one officer and approved by another (D-015).

### W1. Bring the workbook across (once, at go-live)

1. The secretary creates the society with sector **Thrift & credit** or **Community**. Terminology becomes *Card no.* instead of *Staff ID*.
2. **Members → Import** the register from SUMMARY columns A–B. The card number becomes the member number. Blank card slots are skipped and listed.
3. The treasurer sets up four products: Ordinary savings, Share capital, Building fund (savings), and Weekly loan (W5 strategy, 1.5% a month). A second officer approves them.
4. **Import → Opening balances**: savings, share and building balances at the cut-over date, as one entry against 3900 Opening balances (D-022, extended to any number of savings schemes).
5. **Import → Running loans**: granted amount, outstanding balance and grant date (if known). Loans on the flexible strategy (D-028) need no remaining-months figure.
6. **Reconciliation preview before saving.** The system recomputes the workbook's own totals (savings, share, building, granted, outstanding) and shows any difference, such as the row-59 loan above. A second officer approves. The workbook is then frozen as the opening record.

**Replaces:** the "@ 8th April 2025" columns on every sheet.

### W2. Set each member's usual weekly amounts

On the member page, **Weekly contributions** holds the member's usual saving, share and building amounts. The usual loan repayment comes from the loan. These amounts **pre-fill** the collection sheet, so on most weeks the collector only edits the exceptions.
Changes are audited. The society can require the treasurer's approval for them.

### W3. Weekly collection: the core cycle (D-027)

```
Open week ──▶ Record ──▶ Count & lodge ──▶ Submit ──▶ Approve & post ──▶ Receipts
(auto, by     (grid:      (cash counted,    (collector)  (2nd officer;     (statement,
 calendar)     5 columns   bank teller ref)               one journal)      portal, SMS later)
               per card)
```

1. **Open the week.** The system creates the collection sheet for the meeting date from the society's calendar (weekly / fortnightly / monthly, plus a day of the week). Every active member is listed in card order, with usual amounts pre-filled and **interest due** shown.
2. **Record.** A grid that looks like Sheet1: *Card no · Name · Saving · Loan · Share · Building · Int. due · Total*. It is keyboard-first: type the card number to jump to a row, Tab across, Enter down. "Absent" clears a row. Pasting from Excel is supported. Running totals per column sit at the bottom.
   - **Paper fallback:** print the pre-filled blank sheet (the same layout as Sheet1) for meetings without a device, then key it in. An upload of the filled sheet as CSV/XLSX with the same columns is also accepted.
   - Members who paid by **bank transfer** during the week are entered on the same sheet with channel "Transfer" and a reference.
3. **Count and lodge.** The collector enters cash counted and the bank lodgement (teller or transfer reference). The **sheet total must equal cash + transfers**. Any difference is shown in red, and the sheet can't be submitted without an explanation. The difference posts to 2900 Suspense, against the collector's name.
4. **Submit.** The sheet is frozen and becomes one journal submission:
   - Dr Bank / Cash
   - Cr Savings, Share capital and Building fund control accounts (per member)
   - Cr Loans receivable (principal)
   - Cr Interest receivable (interest paid)
5. **Approve.** A second officer (the treasurer or chairperson; never the collector) reviews the totals and exceptions, then approves. Balances update and the week is closed. A posted week can't be edited; corrections are reversals (D-015).
6. **Receipts.** Each member's statement shows the week's lines. Members on the portal see them immediately; SMS/WhatsApp receipts follow later (needs a provider).

**Checks at entry:** an unknown card number; a member with no loan entering a loan repayment; a repayment above the outstanding balance (the excess is offered as savings); a missed interest payment (flagged, not blocked); a duplicate sheet for the same date (refused).

**Replaces:** Sheet1, and the weekly column groups in SUMMARY, WEEKLY SAVING, SHARE and LOAN ACCOUNT.

### W4. Monthly interest charge (D-028)

1. On the first meeting date of each month (configurable: first meeting, or the last day of the month), the system computes for each loan: **interest = 1.5% × outstanding principal at that date**, rounded half-up to the kobo.
2. The treasurer reviews the interest register (the same list as the INTREST ACCOUNT sheet). It posts as one entry (Dr Interest receivable, Cr Interest income) after a second officer approves.
3. That month's collection sheets show each member's **interest due**: the month's charge plus any unpaid interest from earlier months. The member can pay it weekly in the *Int. due* column.
4. Interest paid clears interest receivable first. A shortfall stays as **interest arrears**. Interest is never silently dropped.

**Replaces:** the INTREST ACCOUNT sheet and its `E × 0.015` formula.

### W5. Loans: apply, decide, disburse, repay

The existing loan workflow is reused: application → policy checks → committee decision by a different officer → disbursement approved by another officer.
For community societies the loan product uses the **flexible weekly strategy** (D-028):
- 1.5% a month on the outstanding balance;
- an expected weekly repayment = principal ÷ term in weeks (e.g. ₦400,000 over 50 weeks = ₦8,000 a week);
- the member may pay more or less on any week;
- eligibility checks are product parameters, such as a loan of at most N × (savings + building) and guarantors named by card number.

**Replaces:** the "Loan" and "Outstanding" columns.

### W6. Loan health review: automatic performing / non-performing (D-029)

Each loan is classified from its repayments, recalculated after every posted week:

| Class | Default rule (configurable, pending the auditor) |
|---|---|
| **Performing** | Repaid within the last 30 days and not more than 4 expected repayments behind |
| **Watch** | No repayment for 31–90 days |
| **Non-performing** | No repayment for more than 90 days, or past the loan's end date with a balance outstanding |

- The **Loan portfolio** report shows count and outstanding per class. This replaces the "Total non-performing loan 19 / Performing loan 37" rows and their hand-typed formula.
- The **Follow-up list** for the next meeting lists members in Watch and Non-performing, with their guarantors and the amount behind. It can be printed for the collector.

### W7. Withdrawals and the building fund

Withdrawals use the existing request → decision → payment workflow (D-023), each product with its own rules:
- **Ordinary savings:** withdrawable with notice.
- **Building fund:** withdrawable only for the stated purpose or on exit (a product setting).
- **Share capital:** not withdrawable while a member (D-006 rules apply).

Members with an outstanding loan can be blocked from withdrawing below the loan's savings requirement.

### W8. Month-end summary and reports

At month end, the treasurer runs these reports in place of the SUMMARY sheet. Each one can be printed or exported to Excel in the same column order as today, so committee meetings don't change:

| Report | Same as | Columns |
|---|---|---|
| **Members' position** | SUMMARY A–L | Card no, name, total asset, savings, loan granted, outstanding, share, building |
| **Collections register** | SUMMARY weekly groups | One row per member; for each week of the month: saving, loan, share, building, interest; plus totals |
| **Loan portfolio** | LOAN ACCOUNT footer | Granted, repaid ("net loan"), outstanding, by class |
| **Interest register** | INTREST ACCOUNT | Outstanding, rate, interest charged, paid, arrears |
| **Cash and bank reconciliation** | *(not in the workbook)* | Collections vs lodgements per week, suspense items |

The existing reports (financial position, income and expenditure, trial balance, member statements) work unchanged, because every week posts to the ledger.

### W9. Member self-service

Members on the portal (`/my`) see each balance in the workbook's four columns, their weekly history, interest charged and paid, and their loan class in plain words ("2 repayments behind").
Members without smartphones get a printed statement. SMS balance messages are a later option, after the D-009 and DPIA review.

### W10. Year end

This is unchanged (D-025). The weekly cycle stops at the closed year's last meeting date. Weeks that span the year end are dated by meeting date.

## 12.4 Screen ↔ sheet map

| Today (sheet / cells) | In Cooperative Vaults |
|---|---|
| Sheet1 (blank weekly form) | **Collections → [week] → Record** (grid) · **Print blank sheet** |
| SUMMARY weekly column groups | **Collections → [week]** (posted, read-only) |
| SUMMARY totals (C–L) | **Reports → Members' position** |
| WEEKLY SAVING / SHARE | **Member → Savings / Share / Building tabs** and statements |
| LOAN ACCOUNT | **Loans** list and **Reports → Loan portfolio** |
| INTREST ACCOUNT | **Loans → Interest → [month]** and **Reports → Interest register** |
| "Non-performing loan 19" row | **Loans → Follow-up** (automatic) |
| Card number | Member number (*Card no.* label for community societies) |

## 12.5 What we build, in order

1. **Collection cycle** (W2–W3): calendar, collection sheet grid, cash and lodgement check, posting. This generalises the payroll run (D-020). Payroll is "employer remits a lump sum"; collection is "member pays each column".
2. **Flexible weekly loan strategy and monthly interest run** (W4–W5).
3. **Loan classification and follow-up list** (W6).
4. **Workbook import** (W1): column mapping that reads the SUMMARY sheet directly, with a reconciliation preview.
5. **Community report pack** (W8) with Excel export in the workbook's layout.

## 12.6 Questions for the society and the auditor [OPEN]

1. Is the 1.5% charged on the balance at the **start** of the month, the **end** of the month, or the average? The workbook uses the balance after that month's repayments are recorded, which needs the month to be finished first.
2. When a member pays less than the interest due, should the *Loan* column money cover interest first (D-019 default), or is each column kept as the member designated it (today's practice)?
3. Building fund: is it withdrawable before the project, does it earn anything, and is it restricted to a specific project?
4. What does the society count as non-performing today? The 19 marked loans should be compared with the default rule in W6.
5. Who may collect, and must cash be banked the same day?
6. Should members be charged a fee for missed weeks?
