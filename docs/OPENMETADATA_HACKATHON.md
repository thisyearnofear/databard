# OpenMetadata Hackathon Submission

**Project:** DataBard — Your data catalog, as a podcast  
**Live Demo:** [databard.thisyearnofear.com](https://databard.thisyearnofear.com)  
**Repo:** [github.com/thisyearnofear/databard](https://github.com/thisyearnofear/databard)  
**Paradox:** [#26608 — Conversational Data Catalog Chat App](https://github.com/open-metadata/OpenMetadata/issues/26608) + [#26658 — Data Quality Checks Impact](https://github.com/open-metadata/OpenMetadata/issues/26658)

---

## What It Does

DataBard turns your OpenMetadata instance into a podcast. Ask a question like "What tables are most likely to break downstream?", connect your catalog, and two AI hosts — Alex (the enthusiast) and Morgan (the skeptic) — deliver a conversational answer covering your schemas, quality tests, lineage risks, PII governance, and ownership gaps.

Every episode includes interactive drill-down: click any segment to see the actual columns, tests, lineage, and tags behind what the hosts are discussing.

## Why This Matters

Data catalogs solve discoverability but not consumption. Teams have hundreds of tables with metadata nobody reads. Quality tests fail silently. New members take weeks to understand the warehouse. DataBard makes that metadata consumable — you can listen while commuting, share an episode in Slack, or click into the details when something sounds wrong.

## OpenMetadata API Integration

DataBard uses 8 OpenMetadata API surfaces to build its analysis:

| API Endpoint | What DataBard Does |
|---|---|
| `GET /api/v1/databases` | Discovers all databases to enumerate schemas |
| `GET /api/v1/databaseSchemas` | Lists schemas per database, fetches schema descriptions |
| `GET /api/v1/tables?fields=columns,tags,owners,profile,glossaryTerms` | Full table metadata: columns, types, tags, owners, profiler data, glossary terms |
| `GET /api/v1/dataQuality/testCases?entityLink=<table>` | Quality test results per table — pass/fail/queued status |
| `GET /api/v1/lineage/table/name/<fqn>` | Upstream and downstream lineage edges for cascade risk analysis |
| **Column tags** | PII/Sensitive/Personal classification detection from column-level tags |
| **Glossary terms** | Business context surfaced from table and column glossary associations |
| **Profiler data** | Row counts and freshness timestamps for staleness detection |

### Analysis Layer (built on OM data)

Before generating the script, DataBard computes:

- **Health Score (0–100)** — weighted composite of test failures, coverage, documentation, ownership, lineage, and freshness
- **Critical Table Ranking** — `failing_tests × (1 + downstream_dependents)` identifies cascading risk
- **Coverage Gaps** — tables with zero quality tests
- **Lineage Hotspots** — most-connected nodes in the data flow graph
- **PII Governance Flags** — columns tagged with PII/Sensitive classifications
- **Staleness Detection** — tables not updated in 24+ hours
- **Ownership Mapping** — who owns what, and which tables are unowned

This directly addresses **Paradox #26658 (Data Quality Checks Impact)** — DataBard ranks quality checks by downstream impact and presents explainable risk scores.

## Demo Flow

1. Open [databard.thisyearnofear.com](https://databard.thisyearnofear.com)
2. Click **"Listen to a demo episode"** to hear a sample analysis (no setup required)
3. To connect your own catalog:
   - Run OpenMetadata locally: `docker compose -f docker-compose-postgres.yml up --detach`
   - Click **"Connect your data catalog"** → select OpenMetadata
   - Enter URL (`http://localhost:8585`) and JWT token (Settings → Bots → Ingestion Bot)
   - Select a schema → episode generates in 30–60 seconds
4. Click any segment in the player to drill down into columns, tests, and lineage
5. Download MP3 or share via link

## Architecture

```
OpenMetadata API
       │
       ▼
  ┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
  │  Metadata    │────▶│   Analysis   │────▶│   Script    │────▶│  Audio   │
  │  Adapter     │     │ Health score │     │ LLM / tmpl  │     │ ElevenLabs│
  │  (OM client) │     │ Critical tbl │     │ Two hosts   │     │ TTS + SFX │
  └─────────────┘     │ PII, owners  │     └─────────────┘     └──────────┘
                      │ Lineage risk │                               │
                      └──────────────┘                               ▼
                                                            ┌──────────────┐
                                                            │  Interactive │
                                                            │   Player     │
                                                            │ Drill-down   │
                                                            │ Share/RSS    │
                                                            └──────────────┘
```

**Key files:**
- `src/lib/openmetadata.ts` — OM API client (tables, quality, lineage, tags, owners, profiler, glossary, PII)
- `src/lib/schema-analysis.ts` — Health scoring, critical table ranking, impact analysis
- `src/lib/script-generator.ts` — LLM or template-based two-host script generation
- `src/lib/research.ts` — Research trail with evidence, plan, and recommended actions
- `src/lib/metadata-adapter.ts` — Unified adapter (OM is the primary source)

## Tech Stack

| Layer | Technology |
|---|---|
| Web UI | Next.js 15, React 19, Tailwind CSS 4 |
| Metadata | OpenMetadata REST API v1 |
| AI Scripts | OpenAI-compatible API (GPT-4o-mini) |
| Audio | ElevenLabs TTS (two voices) + Sound Effects |
| Caching | File-backed with TTL (no external DB) |

## What Makes It Different

Most catalog tools show you tables and columns. DataBard tells you **what matters and why** in a format you can consume passively. The two-host format creates natural tension — Alex highlights what's working, Morgan flags what's broken — so listeners get a balanced, memorable walkthrough instead of a wall of metrics.

## Setup for Judges

```bash
# 1. Clone and install
git clone https://github.com/thisyearnofear/databard.git
cd databard && npm install

# 2. Start OpenMetadata (sample data included)
curl -sL -o docker-compose-postgres.yml \
  https://github.com/open-metadata/OpenMetadata/releases/download/1.10.4-release/docker-compose-postgres.yml
docker compose -f docker-compose-postgres.yml up --detach

# 3. Configure and run
cp .env.example .env
# Add ELEVENLABS_API_KEY (Starter plan $5/mo)
# Add OPENAI_API_KEY (optional, for LLM scripts)
npm run dev
# Open http://localhost:3000
```

Or just visit [databard.thisyearnofear.com](https://databard.thisyearnofear.com) and click the demo.
