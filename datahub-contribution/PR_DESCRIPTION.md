# PR — Lineage-Based Blast Radius (Impact) Analysis guide

## Title
`docs: add lineage-based blast-radius (impact) analysis guide`

## Body (paste into the GitHub PR)

**Why**

Lineage currently answers "*what feeds/consumes this?*" but teams only look one
hop. A broken upstream table cascades through the graph and breaks dashboards,
ML features, and contracts nobody traced. This guide documents how to turn
lineage into an **impact primitive** (transitive blast radius) for
prioritisation, triage, and pairing with Assertions / Incidents / Ownership.

**What**

- Documents the GraphQL + REST lineage walks (upstream/downstream).
- Provides a reference **transitive-closure BFS** algorithm (cycle-safe, `O(V+E)`).
- Shows how to rank tables by `failing tests × blast radius` and route
  high-blast-radius/ownerless tables to owners.
- Includes a case study from a working, deployed implementation
  (DataBard fleet analysis: `downstreamCounts` transitive closure, unit-tested
  incl. cycle handling).

**Testing**

Documentation change only — no runtime impact. The referenced algorithm is
implemented and unit-tested in the DataBard project (Apache-2.0).

**Checklist**

- [x] Documentation matches DataHub style (concise markdown, GraphQL + REST examples)
- [x] No breaking changes
- [x] Lineage example queries validated against GMS GraphQL

<!-- link the DataBard implementation for reference: thisyearnofear/databard -->
