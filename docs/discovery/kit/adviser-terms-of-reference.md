# Adviser Terms of Reference

Three short engagements for weeks 1–10 of discovery (decision D-004). Send each brief with a request for a fee quote and a note of any conflicts of interest (for example, an existing relationship with a cooperative software vendor).

Common terms for all three:
- **Client:** TechVaults
- **Purpose:** advise on the design of a configurable cooperative management platform for Nigerian cooperative societies. The engagement is advisory, not a formal opinion for third parties, unless agreed separately.
- **Confidentiality:** mutual NDA. No member personal data will be shared with the adviser.
- **Deliverable format:** a written memo that answers each numbered question. For each answer, mark it as a firm position or as uncertain, and list what would resolve the uncertainty.
- **Timeline:** kick-off in week 1 or 2, interim call in week 5, memo by **week 9**, review session in week 10.

---

## A. Cooperative and financial-services lawyer

**Profile:** Nigerian legal practitioner with cooperative-law and financial-regulation experience. Familiarity with state cooperative departments is preferred.

**Questions** (from [02 §2.6](../02-regulatory-landscape-and-sources.md#26-questions-requiring-expert-review), items 1–7, expanded):
1. How do the Nigerian Co-operative Societies Act (Cap N98) and state cooperative laws (Lagos, the FCT, and one more state we will name) relate? Which governs a society registered in a state whose employer is a federal body? Please give a jurisdiction matrix covering registration, audit, annual returns, reserve rules, disputes and liquidation.
2. Confirm the current status of the Act review and any repeal-and-re-enactment bill announced by FMAFS in 2026. Confirm the status of the 2019, 2023 and 2024 amendment bills.
3. Does s.34 (25% reserve, 10% education fund, distribution approvals) apply unchanged to state-registered societies? Where does the "20 members for savings and credit" figure come from, given that s.3 says 10?
4. On exit and death: what are the scope and order of the s.16 charge and set-off, nominee vs heir under s.18, and what documentation a society may demand?
5. CBN: does taking savings from members only fall outside CBN licensing? What changes if a society accepts payments online or through a payment service provider? What must TechVaults avoid so that it is not itself treated as conducting regulated activity?
6. Interest: are there any caps, disclosure rules or consumer-protection obligations (FCCPC) on member loans?
7. Are electronic records, e-signatures, electronic guarantor consent and electronic AGM voting legally effective (Evidence Act 2011 s.84, and other relevant law)?
8. What are the minimum record-retention periods for cooperative financial and membership records?
9. What contract structure should TechVaults use with societies: SaaS terms, liability caps, data ownership and exit rights?
10. NCSR: does the revalidation or the registry impose data or reporting obligations that software vendors must support?

## B. Cooperative auditor (ICAN-qualified)

**Profile:** Chartered accountant who audits cooperative societies and has filed with at least one State Department of Cooperatives.

**Questions:**
1. Which reporting framework applies in practice (IFRS, IFRS for SMEs, a state-prescribed format)? Does the FRC take a position?
2. Members' shares: are they equity or a liability under IFRIC 2? How should withdrawable and non-withdrawable savings be presented?
3. Interest income: how do flat-rate, reducing-balance and upfront-deducted interest compare in recognition and presentation?
4. What approach do state auditors expect for loan impairment and provisioning?
5. Is there a standard chart of accounts used by state audit departments? Please share a sample.
6. Dividend and patronage-refund computation: what is the basis, the cut-off, and how does the reserve and education-fund appropriation sequence (s.34) work?
7. Which audit trail, period-locking and reversal behaviours would let you rely on system-generated records?
8. Which reports and evidence do you request at every audit? Please share anonymised examples.
9. **Independently verify** a set of worked examples we will prepare (loan schedules, a deduction allocation, an exit settlement, a dividend run). These become acceptance tests.

## C. Data protection officer or licensed compliance organisation

**Profile:** NDPC-licensed Data Protection Compliance Organisation, or a credentialed DPO.

**Questions:**
1. Controller, processor or joint controller: what are the roles of TechVaults and of each society?
2. Is a DPIA required (financial data, scale, NIN or CoopID)? Which GAID 2025 audit-return tier would TechVaults fall in?
3. What lawful basis applies to member, next-of-kin, nominee and guarantor data?
4. Are there hosting location and cross-border transfer requirements?
5. What breach-notification obligations and timelines apply to us and to the societies?
6. Please review our research consent form and document-sharing note ([consent-and-document-sharing.md](consent-and-document-sharing.md)).
7. What is a minimum privacy-by-design checklist for Stage 4 architecture?
