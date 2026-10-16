# 9. Turning Findings into a Configurable Product Requirements Document

## 9.1 Pipeline

```
Interviews + documents
      │  (rule-extraction template, 05 §5.4)
      ▼
Rule inventory  ──►  Variation matrix (rule × society)
      │
      ▼
Classification (5 buckets)  ──►  Expert review on ⚖️ items
      │
      ▼
Policy model (what is configurable, within which guardrails)
      │
      ▼
PRD: use cases, workflows, permissions, acceptance tests, MVP cut
```

## 9.2 The variation matrix

Rows are rules (e.g. "loan eligibility: minimum months of membership"). Columns are societies. Cells hold the observed value and an evidence reference. This makes the classification evidence-based:

| Pattern observed | Classification |
|---|---|
| Same rule everywhere, or mandated by law | **Core**: hard-coded behaviour, not configurable |
| Same rule *shape*, different values (6 vs 3 months; 2× vs 3× savings) | **Configurable policy**: a parameter |
| Different rule shapes (flat vs reducing interest; different allocation orders) | **Configurable policy**: choose from a catalogue of *strategies* we have validated, not a free-form formula |
| Used by some segments only (*ajo*, commodity sales, welfare) | **Optional module** |
| Depends on an external party's format (payroll, bank) | **Integration**: templates and adapters |
| Accounting or legal treatment unclear | **Needs validation**: blocked until an expert memo exists |

**[RECOMMENDATION]** Prefer *parameters* and *named strategies* over a general-purpose rules or formula language. A strategy catalogue can be tested, explained to auditors and shown in plain language in the UI. Arbitrary formulas cannot. Add a new strategy only when a real society needs it and an accountant has verified it.

## 9.3 Guardrails (non-configurable)

These follow from the master prompt §§7–9. They are confirmed or extended by expert review.

- Double-entry integrity; posted entries are corrected only by reversal
- Statutory requirements (e.g. minimum reserve appropriation, if confirmed by counsel)
- Segregation of duties for prepare, approve, post, reverse and audit
- Audit logging of every configuration change, with approver
- **Policy versioning:** each transaction stores the policy version that produced it; a change applies from an effective date and is never retroactive without an explicit, approved recalculation
- Tenant isolation; TechVaults support access only with time-boxed, logged authorisation

## 9.4 PRD structure (Stage 2 output)

1. Problem statements and target segment for the MVP (evidence-linked)
2. Personas and jobs-to-be-done (officer, treasurer, loan officer, payroll officer, auditor, member)
3. Role and permission matrix
4. Use cases per lifecycle area, each with:
   - Business rules (by Rule ID)
   - Workflow diagram (to-be)
   - Configuration parameters and guardrails
   - **Acceptance criteria** written as examples (Given / When / Then), with **worked monetary examples verified by the accountant**
   - Edge cases (short deduction, concurrent approval, duplicate upload, mid-loan policy change, exit with guarantees outstanding)
   - Reports affected and how they reconcile
5. Integration specs (payroll file templates, bank statement import)
6. Non-functional requirements: security, privacy (DPIA outcomes), availability, backup and restore targets (RPO/RTO), performance at expected volumes, accessibility (WCAG 2.2 AA), low-bandwidth behaviour
7. Data migration requirements and opening-balance validation
8. MVP scope, explicit non-goals, and roadmap by stage
9. Open questions and risks

## 9.5 Traceability

Every requirement links back to Rule IDs, evidence (document or interview), and acceptance tests. A requirement with no evidence link is labelled **[HYPOTHESIS]** and cannot enter MVP scope without a validation plan.
