# DataHub Agent Hackathon — DataBard Submission Packet

**Project:** DataBard — an AI data analyst that reads DataHub's Context Platform
via its GraphQL GMS API, synthesises the context graph into a health score, an
audio briefing, and recommended actions, then **writes its findings back into
the graph**.

**Pitch:** *"DataHub gives the agent context; DataBard makes the agent act."*

Built with zero SDK dependency (pure `fetch`/GraphQL) and exposed as an A2MCP
(Agent-to-MCP) surface: `databard_health_check` (free), `databard_write_back`
(free), `databard_fleet_briefing` (free), `databard_briefing` (x402-paid).

Headliner: the **fleet town hall** — the agent reads the WHOLE DataHub graph,
computes lineage-aware cascade impact (blast radius), narrates the estate, and
writes governance (docs + suggested ownership + guardrails) back across every
dataset.

---

## The loop

1. **Read** — `src/lib/datahub-adapter.ts` queries the DataHub GMS GraphQL API:
   datasets, columns, tags, glossary terms, owners, **assertions** (data
   quality), **lineage**, and the last dataset profile (freshness + row count).
2. **Synthesize** — `analyzeSchema` computes the health score, critical tables,
   coverage gaps, and trend narrative; the briefing renders a two-host audio
   summary with recommended actions.
3. **Contribute back** — `writeback` writes governance-grade auto-documentation,
   suggested ownership, and health/defect tags across the fleet — idempotent,
   so the state DataBard found is visible in the DataHub UI.
4. **Town hall** — `databard_fleet_briefing` (`/fleet`, `/api/fleet`) reasons
   over the whole graph: transitive blast radius, top risks, hotspots, and a
   two-host narration of the estate. Most 1000+ projects stop at read + tag;
   DataBard narrates the fleet and then enforces it.

## Judging-criteria mapping

| Criterion | How DataBard addresses it |
|---|---|
| **Use of DataHub** | Reads the full context graph (datasets, lineage, ownership, tags, assertions, profile) AND contributes back — governance docs, suggested ownership, health/defect tags. Fleet blast-radius reasoning over lineage. Goes well beyond reading metadata. |
| **Technical Execution** | End-to-end: connect → list → analyze → brief (audio) → fleet town hall → write back across the graph. Deterministic unit-tested (28 tests incl. lineage blast radius + cycles), `tsc`-clean, production bundle guarded at 86MB, live in prod. |
| **Originality** | The synthesis/audio agent + the lineage-aware "town hall" — no one else narrates the whole estate and then *writes the fix back* into the graph. |
| **Real-World Usefulness** | Closes the "data inaction" gap: findings that land with stakeholders and are written back to governance, not another dashboard row. |
| **Submission Quality** | README + `examples/` fixtures produced by the real pipeline + `< 3 min` demo video (shot list below) + Apache-2.0. |
| **Bonus: OSS contribution** | Concrete plan below — a real DataHub contribution to accompany the submission. |

## Agent-native posture (why no second MCP-client source)

We deliberately consume DataHub's context through its **GMS GraphQL API** — the
same stable read path the DataHub UI and its own MCP server use — rather than
bolting on a second MCP-client transport (redundant + risk with an unconfirmed
endpoint). Our analyst is exposed back to the agent ecosystem as **A2MCP tools**
any MCP-compatible agent can call. DataHub **Skills / Agent Context Kit** are the
intended deep-integration path; the contribution draft in `datahub-contribution/`
is one concrete step on it.

## Setup

**Run DataHub locally:**
```bash
git clone https://github.com/datahub-project/datahub
cd datahub/docker && docker compose -f docker-compose-without-neo4j-m1.yml up -d
# GMS:      http://localhost:8080   (GraphQL: http://localhost:8080/api/graphql)
# UI:       http://localhost:9002
```

**Run DataBard:**
```bash
npm install
npm run dev     # localhost:3000
```
In the wizard: **Connect → 🧭 DataHub** → paste `http://localhost:8080`
(+ optional personal access token) → Connect. Or call the MCP endpoints:

```bash
curl -X POST http://localhost:3000/api/mcp/health-check -H 'content-type: application/json' \
  -d '{"source":"datahub","schemaFqn":"db.sales","datahub":{"serverUrl":"http://localhost:8080"}}'

curl -X POST http://localhost:3000/api/mcp/writeback -H 'content-type: application/json' \
  -d '{"source":"datahub","schemaFqn":"db.sales","datahub":{"serverUrl":"http://localhost:8080"}}'
```

## Demo — one story, under 3 min

Lead with ONE practitioner scenario, not a feature tour. Script:

1. **(0:00) The gap (12s)** — "A payments table gone stale doesn't just break one dashboard. It silently cascades. Data teams find out too late — because they have dashboards, not an analyst."
2. **(0:12) Connect to DataHub (20s)** — pick 🧭 DataHub, paste the GMS URL, connect → the fleet appears.
3. **(0:32) Read + reason (35s)** — `/fleet`: fleet score, and the blast-radius call-out — "order_items is untested, unowned, stale, and sits upstream of downstream surfaces."
4. **(1:07) The town hall (35s)** — play the two-host narration over the dashboard; Alex + Morgan name the fix order.
5. **(1:42) The agent enforces (45s)** — click **"Write back across the fleet"** → flip to the DataHub UI: show the `DataBard_*` tags, the AI-authored governance description, and the suggested owner now on the graph.
6. **(2:27) Close (12s)** — "Read it, synthesise it, act on it — and put it back where your team already works. That's the analyst DataHub context was missing."

## Submission checklist

- [x] Apache-2.0 license
- [x] `examples/` fixtures from the real pipeline
- [x] README DataHub section
- [x] Fleet town hall + enforced write-back (docs/ownership) — live
- [x] `databard_fleet_briefing` MCP tool
- [x] `< 3 min` demo video — `videos/databard-hackathon/renders/databard-v3.mp4` (60s, 1280×720, narration + music, copied to Downloads; upload to YouTube for Devpost)
- [x] README setup instructions — final
- [ ] DataHub OSS contribution (plan below — draft in `datahub-contribution/`)

## Open-source contribution to DataHub (bonus)

Judges explicitly favor meaningful OSS contributions. Land ONE real, mergeable
PR to `datahub-project/datahub`. A ready-to-submit candidate is drafted in
[`datahub-contribution/`](datahub-contribution/BLAST_RADIUS_IMPACT_GUIDE.md) —
a documentation guide on **lineage-based blast-radius analysis** (with the PR
description in `PR_DESCRIPTION.md`). To land it:

1. Fork `datahub-project/datahub`.
2. Add `BLAST_RADIUS_IMPACT_GUIDE.md` under the repo's `docs/` (match the
   nearest existing lineage guide's location/format).
3. Open the PR using `PR_DESCRIPTION.md`, and cite the PR in the submission.

Alternative (if you prefer code over docs): a small **DataHub "Skill"** definition
for the Agent Context Kit.
