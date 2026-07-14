# Field-Sales Allocation Hypothesis

## Status

**Discovery hypothesis — not a committed product pivot or current capability.**

DataBard currently turns data-health signals into a dashboard, narrative, and optional audio briefing. This document records an adjacent opportunity discovered in a publishing-business interview: use the same synthesis discipline to help field-sales leaders allocate scarce salesperson time across schools or other accounts.

The experiment should remain separate from the data-health product until a pilot proves a repeated, paid decision workflow.

## The Problem

Field-sales organisations often have enough activity and commercial data to identify opportunities, but it is fragmented across email, spreadsheets, CRM exports, calendars, messaging tools, and accounting systems. Managers therefore allocate people based on intuition, historical territories, or the loudest request rather than evidence.

For a school publisher, the questions are concrete:

- Which schools have the greatest realistic revenue potential?
- Which high-potential schools are under-covered or have had no meaningful follow-up?
- Which reps are overloaded, and where would reassignment create the largest expected gain?
- Which behaviours distinguish stronger reps after controlling for account quality and territory?
- Which commercial outcomes validate or falsify the recommendation?

The product is not a generic sales dashboard. Its job is to produce a defensible answer to a weekly operating decision.

## Product Thesis

> Turn fragmented commercial signals into an evidence-backed recommendation for where a field-sales team should spend its next unit of time.

The recurring output should be an **allocation briefing**, not a vanity score:

1. What changed in account coverage and realised outcomes?
2. Which high-potential accounts are under-covered, at risk, or misallocated?
3. What is the recommended action, owner, and deadline?
4. What evidence supports it, what is uncertain, and what would change the recommendation?

A short dashboard and written/email briefing are the primary formats. Audio is optional and should only be retained if the pilot users actually consume it.

## Initial Vertical

Start with publishers selling into schools, where account potential and sales capacity are constrained, relationships matter, and the cost of missed coverage is material.

This is a deliberately narrow vertical. It should not be marketed as a replacement for Salesforce, Gong, Clari, accounting software, or a general-purpose CRM analytics product.

## Decision Model

### Canonical entities

| Entity | Minimum fields | Purpose |
| --- | --- | --- |
| Account / school | Canonical name, location, segment, historical spend, potential inputs, owner | The unit to prioritise and allocate |
| Representative | Territory, capacity, tenure, assigned accounts | The limited resource being allocated |
| Activity | Account, rep, date, type, outcome, next step, source | Measures coverage and quality of engagement |
| Opportunity / order | Account, product, stage, expected or actual value, date | Connects activity to commercial progress |
| Accounting outcome | Customer/account, invoice, payment/credit status, amount, date, source snapshot | Independent ground truth for realised revenue |
| Recommendation | Proposed action, expected effect, confidence, evidence links, manager disposition | Makes the system reviewable and accountable |

### Core measures

- **Account potential:** an explainable estimate based on observed characteristics such as school size, curriculum fit, historical spend, location, buying cycle, and prior conversion. It must be editable by a manager.
- **Coverage gap:** expected contact cadence for an account tier minus observed meaningful activity in the relevant period.
- **Capacity fit:** whether a rep has enough practical capacity to serve assigned high-potential accounts.
- **Opportunity-adjusted performance:** realised progression or revenue compared with the expected result for comparable accounts, territories, and time windows.
- **Allocation opportunity:** a ranked recommendation that combines under-covered potential, rep capacity, and confidence in the account/revenue linkage.

Raw revenue, visit count, and quota attainment must not be used alone to rank reps. They systematically reward easier territories and inherited account portfolios.

## Evidence Standard

A recommendation is only as trustworthy as its connection to an outcome. Every recommendation should expose:

- the source records and dates used;
- the school/account match and match confidence;
- the activity and outcome window used for the calculation;
- the factors that produced the potential estimate;
- known gaps or ambiguities;
- the recommendation's confidence and its expected—not guaranteed—effect;
- manager approval, rejection, or override and the reason.

This makes the product a decision-support system, not an opaque employee-ranking system.

### Validate against business outcomes

The product should connect activity and allocation hypotheses to outcomes from orders, invoices, payments, renewals, or another authoritative commercial record. The goal is not to claim that one visit caused a payment; it is to test whether recommended coverage and allocation patterns are associated with better outcomes after accounting for obvious confounders.

Early analyses should be conservative:

- use pre-defined account cohorts and time windows;
- compare like with like (account tier, territory, season, product, and tenure where available);
- label associations as associations, not causation;
- measure recommendation adoption separately from commercial outcome;
- back-test on historical periods before making live allocation recommendations;
- use manager review for every reassignment or performance-sensitive action.

## Data and Trust Architecture

### Start with controlled imports

The first pilot should use a minimal, reviewable dataset rather than broad inbox access:

1. **Account master:** school/account attributes, assigned rep, and potential inputs.
2. **Activity export:** visits, calls, follow-ups, outcomes, and next steps from the system the team actually uses.
3. **Commercial outcome export:** orders, invoices, payments, credits, or renewals.

Email can enrich activity evidence later, but should not be assumed to be the source of truth for field visits. Confirm whether the organisation uses email, a CRM, WhatsApp, calendar events, manager reports, or paper registers before building an integration.

### Access and privacy defaults

- Prefer read-only, scoped access and data minimisation.
- Start with customer/account-level outcome fields, not a full general ledger or payroll data.
- Separate data used for operating recommendations from data visible in rep-performance views.
- Keep email/message content out of ranking logic unless it is necessary, explicitly authorised, and reviewable.
- Provide retention controls, source revocation, export/deletion paths, and an audit trail of access and analysis runs.
- Do not use the product for covert monitoring or automatic employment decisions.
- Obtain appropriate contractual, privacy, and employment review for each deployment.

### Accounting data

Accounting data can be a valuable independent outcome layer, but it should be introduced carefully:

- Begin with the smallest necessary scope: customer, invoice/payment identifier, amount, status, credit/refund status, and relevant dates.
- Reconcile a canonical school/account identity to the accounting customer identity; surface unresolved matches instead of silently guessing.
- Treat invoices and payments as different signals. An invoice can support booked revenue; payment status supports realised cash; credit notes can reverse either conclusion.
- Record the source system, extraction time, reporting period, transformation version, and a fingerprint of each imported snapshot.
- Show the underlying reconciliation in the evidence view so a manager can audit a recommendation.

Xero or QuickBooks connectors are a later convenience layer, not a prerequisite for proving the workflow. A read-only export can validate the product hypothesis first.

### Zero-knowledge and attestation

Zero-knowledge proofs are **not** the first answer to access trust.

A proof can demonstrate that a computation was performed correctly over committed inputs, for example: “revenue for a cohort exceeds a threshold” or “this allocation score was calculated from this snapshot without revealing every invoice.” It does **not** prove that an uploaded Xero or QuickBooks export was true. That requires provenance from the accounting source, a trusted connector, signed/attested snapshots, or an auditor.

Recommended sequence:

1. Read-only, least-privilege accounting access or a scoped export.
2. Immutable evidence metadata: source, timestamp, transformation version, and content hash.
3. A human-readable reconciliation and audit log.
4. Optional signed attestations of report snapshots if customers need tamper evidence.
5. Evaluate ZK proofs only when a real customer needs to share an aggregate or benchmark without disclosing underlying invoices. At that point, define the exact predicate, verifier, source-attestation model, and operational cost before committing.

For an enterprise buyer, a transparent evidence trail and restricted access are likely to build trust faster than cryptographic novelty.

## Pilot

### Pilot question

Can an evidence-backed allocation briefing cause a sales leader to make better, repeatable coverage or reassignment decisions than their current process?

### Pilot workflow

1. Obtain historical account, activity, and commercial outcome exports for an agreed period.
2. Resolve account identities and show the client unresolved or ambiguous matches.
3. Build a baseline of potential, coverage gaps, capacity, and historical outcomes.
4. Produce a small set of manager-reviewable recommendations with evidence.
5. Track which recommendations were adopted and why others were rejected.
6. Compare subsequent coverage and commercial outcomes against a pre-agreed baseline or comparable cohort.

### Success signals

- A manager changes a real coverage, prioritisation, or allocation decision because of the briefing.
- The evidence view is sufficient for the manager to trust or intelligently challenge a recommendation.
- The same decision recurs on a weekly or termly cadence.
- Recommendation adoption, coverage, pipeline progression, or realised outcomes improve relative to a credible baseline.
- The customer is willing to provide ongoing data access or pay for the repeated workflow.

### Non-goals for the pilot

- Replacing the CRM, accounting system, or field-service tool.
- Fully automated account reassignment.
- Causal claims from small or uncontrolled datasets.
- Inbox surveillance or rep ranking based on unreviewed message content.
- Building a live Xero/QuickBooks integration or ZK system before the decision workflow is validated.

## Product Implications if Validated

If the pilot succeeds, the reusable DataBard components are narrative generation, evidence trails, schedules, delivery, and dashboard patterns. The product would need new domain-specific capabilities:

- a commercial entity model rather than `SchemaMeta` only;
- account/entity resolution and review;
- source adapters for the activity and accounting systems actually used;
- explainable potential and coverage calculations;
- outcome reconciliation and historical back-testing;
- a sales-specific dashboard and recommendation review workflow;
- a distinct field-sales positioning and onboarding path.

The data-health offering should remain intact while this is validated as a separate vertical.
