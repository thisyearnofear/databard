# DataHub Agent Hackathon — DataBard Submission Packet

**Project:** DataBard — an AI data analyst that reads DataHub's Context Platform
via its GraphQL GMS API, synthesises the context graph into a health score, an
audio briefing, and recommended actions, then **writes its findings back into
the graph**.

**Pitch:** *"DataHub gives the agent context; DataBard makes the agent act."*

Built with zero SDK dependency (pure `fetch`/GraphQL) and exposed as an A2MCP
(Agent-to-MCP) surface: `databard_health_check` (free), `databard_write_back`
(free), `databard_briefing` (x402-paid).

---

## The loop

1. **Read** — `src/lib/datahub-adapter.ts` queries the DataHub GMS GraphQL API:
   datasets, columns, tags, glossary terms, owners, **assertions** (data
   quality), **lineage**, and the last dataset profile (freshness + row count).
2. **Synthesize** — `analyzeSchema` computes the health score, critical tables,
   coverage gaps, and trend narrative; the briefing renders a two-host audio
   summary with recommended actions.
3. **Contribute back** — `/api/mcp/writeback` tags each table (health band +
   ownerless / untested / undocumented / stale) and appends an idempotent AI
   summary, so the state DataBard found is visible in the DataHub UI.

## Judging-criteria mapping

| Criterion | How DataBard addresses it |
|---|---|
| **Use of DataHub** | First-class GMS GraphQL adapter reads the context graph **and** contributes back via `addTag` / `updateDescription`. Goes beyond reading metadata. |
| **Technical Execution** | End-to-end working pipeline: connect → list schemas → analyze → brief (audio) → write back. Deterministic unit-tested, `tsc`-clean, production bundle guarded at 85MB. |
| **Originality** | Composes DataHub's context with a synthesis/audio agent DataHub doesn't ship — the health score → narrative → actionable briefing, plus write-back tagging. |
| **Real-World Usefulness** | Closes the "data inaction" gap: findings that land with stakeholders and are written back to governance, not another dashboard row. |
| **Submission Quality** | README + `examples/` fixtures produced by the real pipeline + `< 3 min` demo video (shot list below) + Apache-2.0. |
| **Bonus: OSS contribution** | *(planned)* a small DataHub connector / Skill definition / RFC. |

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

## Demo shot list (< 3 min)

1. **(0:00) Hook (10s)** — "Your data estate's findings never reach the people who act. DataBard is an agent that reads DataHub's context graph, synthesises what it finds, and writes it back."
2. **(0:10) Connect (20s)** — Pick 🧭 DataHub, paste the GMS URL, connect → schemas list.
3. **(0:30) Health check (30s)** — `/api/mcp/health-check`: score, critical tables, recommended actions on screen.
4. **(1:00) Briefing (40s)** — Play the audio briefing over the dashboard.
5. **(1:40) Contribute back (30s)** — run writeback → flip to the DataHub UI and show the new `DataBard_*` tags + AI summary description on the datasets.
6. **(2:10) Close (20s)** — "Read it, synthesise it, act on it — and put it back where your team already works."

## Submission checklist

- [x] Apache-2.0 license
- [x] `examples/` fixtures from the real pipeline
- [x] README DataHub section
- [ ] `< 3 min` demo video (YouTube/Vimeo, public)
- [ ] README setup instructions final
- [ ] Optional: meaningful DataHub OSS contribution
