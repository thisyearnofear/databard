# Lineage-Based Blast Radius (Impact) Analysis

> **Proposed contribution to `datahub-project/datahub`** — documentation + a
> reference implementation pattern. Written from a working, deployed
> implementation (see the case study at the end).

## Why this matters

Lineage answers "what feeds this table?" and "what consumes it?" — but most
teams only look one hop. A broken *freshness* or *quality* issue on an upstream
table rarely stays one hop: it cascades through the graph and breaks dashboards,
ML features, and down-stream contracts that nobody traced.

**Blast radius** is the transitive count of downstream entities a change ripples
into. It turns lineage from a *diagnostic* into an *impact* primitive:

- **Prioritisation.** A failing test on a table with 40 downstream consumers is
  an incident; on a table with 0, it's a to-do.
- **On-call triage.** "This broke 12 surfaces" tells the owner who to ping.
- **Contracts & incidents.** Pair blast radius with DataHub **Assertions** and
  **Incidents** to gate deploys and auto-annotate impact.

## Walking lineage via GraphQL

DataHub's GraphQL API exposes both directions on a dataset:

```graphql
query Lineage($urn: String!) {
  dataset(urn: $urn) {
    urn
    upstreamLineage {
      entities { entity { urn } }
    }
    downstreamLineage {
      entities { entity { urn } }
    }
  }
}
```

For paginated, direction-specific walks use the lineage REST endpoint:

```
GET /lineage?urn=<dataset-urn>&direction=DOWNSTREAM&start=0&count=100
GET /lineage?urn=<dataset-urn>&direction=UPSTREAM&start=0&count=100
```

## Transitive closure (the algorithm)

Blast radius is the size of the **downstream transitive closure**: every entity
reachable from the starting dataset by following `downstreamLineage` edges (and
for upstream impact, the upstream closure). Use a breadth-first search with a
visited set — BFS bounds work to `O(V + E)` over the sub-graph and is
cycle-safe (DataHub graphs can contain diamond and loop patterns):

```text
function downstreamSet(start, adj):
  seen = { start }
  queue = adj[start]           # immediate downstream uids
  while queue is not empty:
    u = queue.pop_front()
    if u in seen: continue
    seen.add(u)
    for v in adj[u]:
      if v not in seen: queue.push(v)
  return seen \ { start }      # blast radius = |seen| - 1
```

Where `adj[u]` is the set of downstream URNs of `u`. `|seen| - 1` is the blast
radius. Filter the graph to `Dataset` entities and deduplicate URNs that repeat
across environments (prefer `PROD`).

## A reference open implementation

A tested, dependency-free reference of exactly this (transitive BFS + risk
ranking + fleet health) is implemented in the DataBard project —
`fleet-analysis.ts` (`downstreamCounts` computes the transitive closure; the
engine then ranks tables by `failing tests × blast radius`). It runs over the
DataHub GraphQL output shown above, is unit-tested including cycle handling, and
is Apache-2.0.

## Pairing impact with DataHub's guardrails

- **Assertions** — the blast radius of a *failing* assertion is the interesting
  number; surface it in the assertion/Data Contract view.
- **Incidents** — when a high-blast-radius dataset fails, auto-attach the impact
  list to the incident for handoff.
- **Ownership** — route high-blast-radius, ownerless tables to a suggested owner.

## Case study: DataBard fleet town hall

DataBard reads the whole DataHub context graph, computes transitive blast
radius per dataset via the BFS above, and narrates the estate in a two-host
briefing (`/fleet`). A stale, untested, ownerless table that sits upstream of
many surfaces is ranked as the #1 fix because its blast radius is large — the
exact prioritisation a human analyst would apply, automated from lineage.

---

*This guide is a documentation improvement proposed for
`datahub-project/datahub`; reference implementation: [DataBard](https://github.com/thisyearnofear/databard).*
