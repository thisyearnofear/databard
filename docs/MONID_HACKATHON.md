# Monid "We Kill" Hackathon — DataBard Submission Packet

**Project:** DataBard — an AI data analyst that turns **any Monid metered
endpoint** into a data-health score, an audio briefing, and prioritised
recommended actions, with the **measured per-run cost** carried through as the
receipt.

**Pitch:** *"Monid is the OpenRouter for agent tools — one key, 1,900+ metered
endpoints, per-call cost in the run result. DataBard is the analyst that reads
any of them, scores the data's health, narrates the finding, and shows the exact
cents it cost to reach it."*

Built for the **A2MCP** (Agent-to-MCP) surface: `databard_health_check` (free)
and `databard_briefing` (x402-paid) now accept `source: "monid"` and return a
`monidCost` receipt alongside the health score.

---

## The kill (honest framing — read this before writing any copy)

The hackathon asks us to kill a **human-seat SaaS workflow that has a real
published price**. The defensible, honest kill here is **narrow**:

- **What we kill:** the *paid seat required to **monitor** data health* — a human
  logging into a dashboard, eyeballing freshness/quality/ownership, and writing
  the "state of the data" update. DataBard does that continuously, per-call, for
  measured cents.
- **What we do NOT kill:** the query editor, the modeling layer, or "Dune-the-
  product." DataBard **analyzes** data; it does not replace the place you *write*
  queries. Overstating this is the fastest way to lose judge trust.

**Kill target is discovery-decided.** Per the plan, we run `monid discover`
first and commit the narrative to whichever target Monid can *genuinely* service
with healthy, cheap, **row-returning** endpoints. The adapter is deliberately
**generic** (provider + endpoint + inputs → `SchemaMeta`) so the target can move
without a code change. **Step 0 below is the gate.**

### Verified facts to use (and not overstate)

- **Monid** = "OpenRouter for agent tools": one API key, 1,900+ metered
  endpoints, per-call cost returned in the run result. CLI `@monid-ai/cli`
  (`monid discover / inspect / run --wait -j`, `monid balance`, `monid keys`).
- **Dune tiers** (candidate incumbent): Free / Plus ≈ **$349–390/mo** /
  Premium ≈ $1,990/mo / Enterprise. Two facts worth citing: *"failed query
  executions are still billed"*, and the **free tier goes view-only on
  Sep 10, 2026** (reported by KuCoin + CryptoBriefing).
- ⚠️ **Do NOT fabricate the Dune price.** Sources disagree ($349 vs ~$390).
  **Re-verify the exact Plus price at `dune.com/pricing` before it appears in any
  video or submission.** Until then, write "≈$349–390/mo" or omit the number.

---

## The loop

1. **Discover** — `monid discover -q "<capability>"` finds candidate metered
   endpoints; `monid inspect -p <provider> -e <endpoint>` returns the exact
   `pathParams` / `queryParams` / `body` shape.
2. **Run** — `src/lib/monid-adapter.ts` shells to the `monid` CLI
   (`execFile`, never a shell — the Coral precedent) with `run -p … -e … -j
   --wait`, env-first `MONID_API_KEY` + optional body override.
3. **Map** — `parseMonidRun` + `extractRows` normalise the arbitrary result
   shape (named container → top-level array → nested object-array →
   array-of-arrays + header → single flat object → honest `[]`), then
   `inferColumns` + `buildMonidSchema` produce one `SchemaMeta` table.
4. **Synthesize** — `analyzeSchema` computes the health score, critical tables,
   coverage gaps, and recommended actions; the briefing renders a two-host audio
   summary (`Alex` + `Morgan`).
5. **Surface the cost** — the measured per-run `cost` is captured in a
   `getMonidCost(fqn)` sidecar and returned as `monidCost` on
   `/api/mcp/health-check` and `/api/mcp/briefing`. **This is the receipt**: an
   agent-paid per-call cost that sits next to the incumbent's human-seat price.

## Judging-criteria mapping

| Criterion | How DataBard addresses it |
|---|---|
| **Use of Monid** | Generic adapter over the metered catalog — any `provider` + `endpoint` from `discover`/`inspect`, run live via the CLI, result rows mapped to a health score. The per-call **cost is captured and surfaced**, not hidden. |
| **The kill** | Replaces the *paid seat to monitor data health* with a per-call agent analyst. Honest scope: analyzes data, does not claim to replace the query editor. Target is discovery-decided. |
| **Technical Execution** | End-to-end on the stateless A2MCP path: connect → run → map → analyze → brief → surface cost. `tsc`-clean, deterministic unit tests (`tests/monid-adapter.unit.ts`, 32 tests over the pure mapping layer), production bundle guarded, honest error taxonomy (hard failures → actionable 400, soft failures → degrade with a note, keeping the receipt). |
| **Runs on live data** | Every run is a live metered Monid call — no fixtures in the demo path. |
| **Originality** | The **measured-cost receipt**: the health score arrives with the exact cents the data reach cost, so an agent (or a judge) can compare per-call spend against a monthly seat. |
| **Submission Quality** | This packet + `AGENTS.md` + `.env.example` + architecture docs. **Video + social are DEFERRED** (see checklist) — the code/docs ship now as a real product asset. |

## Agent-native posture

DataBard is already an agent-native analyst on OKX.AI A2MCP. Monid slots in as a
**data-reach layer**: instead of hard-wiring one vendor, the agent picks an
endpoint at runtime (`discover` → `inspect` → `run`) and DataBard scores whatever
rows come back. The credential model is **env-first with a body override**
(`MONID_API_KEY` on the server, or `monid.apiKey` in the request), mirroring the
Coral/Dune adapters. Monid's own SKILL.md precedence — *"fills the gaps, does not
replace tools the user already has"* — matches how we treat it: a long-tail reach
adapter, not a replacement for the Tier 1 sources.

## Setup

**Install the Monid CLI + key (Step 0 gate — user-run, spends cents on `run`):**
```bash
npm i -g @monid-ai/cli
monid keys add -k <MONID_KEY> && monid keys list && monid balance
# FREE — let the catalog pick the target:
monid discover -q "on-chain token price and volume time series for a data health score" -l 10 -s 0.5 -j
monid inspect -p <provider> -e <endpoint> -j      # note pathParams / queryParams / body
monid run -p <provider> -e <endpoint> -i '<bodyJSON>' --wait -j   # SPENDS cents — confirms shape + cost field
```

**Run DataBard:**
```bash
npm install
# server env (or pass monid.apiKey per request):
export MONID_API_KEY=<key>
npm run dev     # localhost:3000
```

**Call the A2MCP health check (free) with a Monid source:**
```bash
curl -s -X POST http://localhost:3000/api/mcp/health-check \
  -H 'content-type: application/json' \
  -d '{"source":"monid","schemaFqn":"monid.run","monid":{"provider":"<p>","endpoint":"<e>","inputs":{}}}' | jq
# → ok:true, health{…}, recommendedActions[…], and a top-level monidCost{costUsd,…} receipt
```

**Honest-error negative path (no CLI / no key):** the same call returns an
actionable message — *"The Monid CLI (`monid`) isn't installed…"* / *"No Monid
API key…"* — as HTTP **400**, not a stack trace or a 500.

## Demo — one story, under 90s (DEFERRED: shot list only)

> The video is **not shot yet** (scope decision: build + docs now, video later).
> This is the numbered shot list to execute once Step 0 fixes the target and the
> Dune price is re-verified.

1. **(0:00) The seat (10s)** — "Monitoring data health is a paid seat. Dune Plus
   is ≈$349–390/mo *(re-verify before recording)*, and failed query executions
   are still billed. On Sep 10 the free tier goes view-only."
2. **(0:10) Discover (12s)** — `monid discover -q "…"` → pick a healthy, cheap,
   row-returning endpoint. Show `monid inspect` for its inputs.
3. **(0:22) One call (15s)** — `POST /api/mcp/health-check` with
   `source:"monid"` → the health score, critical tables, and recommended actions
   render.
4. **(0:37) The receipt (15s)** — zoom the `monidCost` object: **"$0.00xx for
   this run."** Put it next to the incumbent's monthly seat. "Same finding. A few
   cents, per call, on live data — not a seat."
5. **(0:52) The briefing (20s)** — `POST /api/mcp/briefing` (x402) → play the
   two-host audio over the dashboard; the measured cost rides along in the
   response.
6. **(1:12) Close (10s)** — "Any Monid endpoint. A health score, a narration, and
   the exact cents it cost. That's the analyst seat, killed per-call."

## Submission checklist

- [x] Generic `monid` source adapter (`src/lib/monid-adapter.ts`) — CLI exec + result → `SchemaMeta`
- [x] Router + config-builder wiring (`metadata-adapter.ts`, `mcp.ts`, `/api/connect`, `pipeline.ts`, `synthesize`, `synthesize-stream`, `validate-schema`)
- [x] A2MCP discovery advertises `monid` (`/api/mcp/tools` — source enum + `monid` schema + `monidCost` output)
- [x] Measured-cost receipt on `/api/mcp/health-check` **and** `/api/mcp/briefing`
- [x] Honest error taxonomy (hard → actionable 400; soft → degrade with a note, keep the receipt)
- [x] `tsc`-clean + deterministic unit tests (`tests/monid-adapter.unit.ts`, 32 tests, offline)
- [x] Docs: this packet, `AGENTS.md`, `DATA_SOURCES_ARCHITECTURE.md`, `.env.example`
- [ ] **DEFERRED — Step 0 discovery** (`monid discover`/`inspect`/`run`): needs the user's Monid key + spends their balance; fixes the kill target + the concrete `provider`/`endpoint`
- [ ] **DEFERRED — Live health-check verification** against a real endpoint (the confirming `run` spends cents)
- [ ] **DEFERRED — Wizard UI (Part G):** Monid is driven via A2MCP for now; wire the picker fields once discovery fixes the target
- [ ] **DEFERRED — Re-verify the Dune Plus price** at `dune.com/pricing` (do not fabricate)
- [ ] **DEFERRED — `<90s` demo video** (shot list above)
- [ ] **DEFERRED — Social push:** first post on each of X / LinkedIn / Instagram / TikTok / YouTube with `#monid` + the register URL within 24h (Reach 250 + Viral 200)
