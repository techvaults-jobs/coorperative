# Cooperative Sector Discovery and Research Plan

**TechVaults Cooperative Management Platform · Stage 1: Discovery**
Version 0.1 · Prepared 17 October 2026 · Status: Draft for internal review

> Guiding principle: understand how cooperatives work before building software to manage them.

Stakeholder summary page (private until shared): https://claude.ai/artifact/Qu7aMs1gPa1q4inSrSZwMB

This folder is the first deliverable from the master prompt (§16). It is a **plan and a set of research instruments**. It does not specify the product. No code, schema or stack decisions should be taken from it.

## Evidence labels used throughout

Each claim carries one of these labels, so readers can see how far to trust it.

| Label | Meaning |
|---|---|
| **[VERIFIED]** | Confirmed in an official or primary source, which is cited. Still subject to legal review before we build anything on it. |
| **[REPORTED]** | Stated by credible secondary sources (press, law-firm commentary, vendor sites). Not independently confirmed. |
| **[STAKEHOLDER]** | Opinion or practice reported by an interviewee. Applies to their society only. *(No interviews yet, so this label is not used in v0.1.)* |
| **[HYPOTHESIS]** | Our working belief. It needs testing. |
| **[RECOMMENDATION]** | Our proposed course of action. |
| **[OPEN]** | An unanswered question. |

## Contents

| # | Document | Master prompt item |
|---|---|---|
| 1 | [Cooperative models to study](01-cooperative-models.md) | Map of cooperative models |
| 2 | [Regulatory landscape and sources](02-regulatory-landscape-and-sources.md) | Laws, regulators, sector bodies, research sources |
| 3 | [Stakeholder interview guides](03-interview-guides.md) | Interview guide by role |
| 4 | [Workflow checklist](04-workflow-checklist.md) | Membership through final settlement |
| 5 | [Sample document collection template](05-sample-collection-template.md) | Template for anonymised forms and reports |
| 6 | [Competitor analysis framework](06-competitor-analysis-framework.md) | Competitor framework |
| 7 | [Assumptions register](07-assumptions-register.md) | Assumptions that must not be treated as facts |
| 8 | [Timeline, deliverables and success criteria](08-timeline-and-success-criteria.md) | Discovery timeline |
| 9 | [From findings to a configurable PRD](09-findings-to-prd.md) | Plan for the requirements document |
| 10 | [Choosing the first pilot cooperative](10-pilot-selection.md) | Pilot recommendation |
| 11 | [UX and UI direction](11-ux-and-ui-direction.md) | Design principles and UI component strategy (provisional) |
| 12 | [Community contribution workflows](12-community-contribution-workflows.md) | Weekly collection, interest, loan health and reports designed from the COMMUNITY CONTRIBUTION workbook |
| — | [Decision log](decisions.md) | Decisions accepted 17 Oct 2026 |
| — | [Fieldwork kit](kit/) | [Adviser ToRs](kit/adviser-terms-of-reference.md) · [Outreach](kit/recruitment-outreach.md) · [Screener](kit/screener.md) · [Consent and document sharing](kit/consent-and-document-sharing.md) |

## Progress report (format from master prompt §15)

**Current understanding**
- [VERIFIED] The Federal Ministry of Agriculture and Food Security (FMAFS) calls itself the supervising ministry for cooperative development. The Nigerian Co-operative Societies Act (Cap N98 LFN 2004) is under review, and the plan is to align it with the ICA-Africa Model Cooperative Law ([FMINO, 30 Jan 2026](https://fmino.gov.ng/fg-to-revolutionize-cooperative-societies-through-digitalization/)).
- [VERIFIED] On 12 August 2026, FMAFS signed an MoU with Seamfix for a National Cooperative Smart Registry (NCSR). The NCSR issues a Cooperative Verification Number (CVN) to each society and a CoopID to each member. A six-month revalidation of all cooperatives, run through State Departments of Cooperatives, started at the same time ([FMINO, 12 Aug 2026](https://fmino.gov.ng/fg-signs-mou-to-deploy-national-cooperative-digital-identity-system-announces-6-month-revalidation-for-all-cooperatives/)).
- [VERIFIED] The NDPA 2023 is now implemented through the NDPC's GAID 2025, which took effect on 19 September 2025 and replaced the NDPR 2019 ([DLA Piper](https://privacymatters.dlapiper.com/2025/06/nigeria-ndpc-issues-gaid-key-compliance-insights/), [Afriwise](https://www.afriwise.com/blog/www-afriwise-com-blog-the-nigeria-data-protection-act-general-application-and-implementation-directive-2025-becomes-effective-today)). We still need to read the official text.
- [VERIFIED] The text of Cap N98 was read from two independent copies. It provides a 25% statutory reserve (s.34(2)), an education fund capped at 10% (s.34(3)), a one-fifth share-holding cap (s.27), no loans to non-members (s.30), the society's charge and set-off over member shares and deposits (s.16), nominee-first transfer on death (s.18), year-end audit (s.36), and State Directors of Cooperatives (s.1(2)). The Act says nothing about payroll deductions. See [02 F17–F27](02-regulatory-landscape-and-sources.md).
- [OPEN] We do not yet know how federal and state cooperative laws divide authority. We also do not know whether a new Cooperative Societies Bill has been introduced, how the revalidation is going in each state, or whether the NCSR will offer integration APIs.
- [OPEN] We have done no field interviews. Everything we know about how societies operate is still hypothesis.

**Business impact.** The federal digitalisation programme and the revalidation deadline (about February 2027, if six months from 12 August 2026 holds) give societies a reason to move off paper and spreadsheets now. That is a time-limited opening. It also carries a risk: the regulator may impose a data or identity standard we have not yet seen.

**Recommendation (accepted 17 Oct 2026, see [decision log](decisions.md)).** Run the 12-week discovery plan ([08](08-timeline-and-success-criteria.md)). Start in parallel with (a) desk verification of the legal questions, with a Nigerian cooperative lawyer, and (b) recruiting 8 to 12 societies, weighted towards staff (salary-deduction) cooperatives.

**Implementation.** Documents only. No code. Week 0 desk work is done: Act provisions extracted, competitor desk scan ([06 §6.4](06-competitor-analysis-framework.md#64-desk-scan-results-week-0-17-oct-2026)), fieldwork kit drafted.

**Verification.** Every source was checked as of 17 October 2026. Each claim's label shows how far it was verified.

**Open questions and risks.** See [07 Assumptions register](07-assumptions-register.md) and the expert-review list in [02 §2.6](02-regulatory-landscape-and-sources.md#26-questions-requiring-expert-review).
