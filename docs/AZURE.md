# DataBard on Azure — Architecture & Migration Plan

DataBard is an AI analyst for data estates: one analysis engine ingests metadata from any
catalog or warehouse (OpenMetadata, dbt, The Graph, Dune, or anything via Coral SQL),
computes health scores, lineage risk, and governance flags, and renders the findings as
AI podcast episodes, dashboards, PDF reports, webhook alerts, and Solana attestations.

This document maps the current architecture onto Azure and sequences the migration.
Prepared for the Microsoft for Startups Azure Technical Advisory engagement.

## Current architecture

| Layer | Today | Notes |
|---|---|---|
| App | Next.js 15 (standalone) on a single VPS, PM2 (`ecosystem.config.cjs`) | Port 42100, `databard` process |
| Sidecar | Coral bridge (`scripts/coral-bridge.mjs`) | Port 42101, brokers Tier-2 SQL sources |
| LLM inference | OpenAI-compatible API (`OPENAI_BASE_URL`), GPT-4o-mini default | Script generation for podcasts, briefings, fix guidance |
| Audio | ElevenLabs TTS (two voices) + Sound Effects + Music API | Largest external dependency after LLM |
| Storage/cache | File-backed with TTL under `DATABARD_DATA_DIR` | SFX 30d, speech 24h, scripts 1h, metadata 5–10min |
| Cron | `GET /api/onchain/check-alerts`, scheduled regeneration | Cron-ready endpoints, invoked externally |
| Onchain | Solana (Memo + PDA registry), SNS identity, Palm USD | Stays as-is; not part of the Azure migration |

**Cost centers, largest first:** LLM inference, ElevenLabs audio synthesis, hosting.

## Phase 1 — Azure OpenAI for inference (works today, zero code changes)

All LLM calls go through a single helper (`src/lib/llm-providers.ts` → `openaiChat`) that
targets any OpenAI-compatible endpoint. Azure OpenAI's v1 compatibility endpoint is a
drop-in — configuration only:

```env
OPENAI_BASE_URL=https://YOUR_RESOURCE.openai.azure.com/openai/v1
OPENAI_API_KEY=<azure openai key>
OPENAI_MODEL=<deployment name, e.g. gpt-4o-mini>
```

This moves the largest variable cost onto Azure credits immediately.

**Asks for the Technical Advisor:**
- Azure OpenAI resource + GPT-4o-mini / GPT-4o quota in a region close to users
- Guidance on quota tiers and how startup quota increases are requested
- Whether provisioned throughput ever makes sense at our scale vs. standard pay-as-you-go

## Phase 2 — Hosting on Azure Container Apps

The PM2 topology (app + sidecar) containerizes directly:

- **`databard` app** → Container App (Next.js standalone image), min replicas 1,
  scale on HTTP concurrency. Long-running audio-generation requests (30–90s streaming
  responses) need request timeout ≥ 300s.
- **`coral-bridge` sidecar** → second container in the same Container App (localhost
  networking preserved — the app reaches it at `CORAL_GATEWAY_URL=http://localhost:42101/query`).
- **Secrets** (`ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, Solana treasury config) → Container
  Apps secrets, later Key Vault references.

## Phase 3 — Storage, CDN, and scheduled jobs

- **Generated audio (MP3s) and file cache** → Azure Blob Storage. The cache layer is a
  single file-backed module today, so the swap is one storage backend, not a rearchitecture.
- **Audio delivery** → Azure Front Door (or Blob + CDN) for cached episode/anthem serving
  and OG images.
- **Cron** → Container Apps Jobs (or Functions timers) invoking the existing endpoints:
  health-alert checks (`/api/onchain/check-alerts`) and Pro-tier scheduled regeneration.
- **Observability** → Azure Monitor + Log Analytics replacing PM2 log files.

## Phase 4 — Deeper Azure integration (roadmap)

- **Microsoft Purview Tier-1 adapter** — Purview is the Azure-native analog of
  OpenMetadata, and DataBard's deepest adapter (OpenMetadata) is the template.
  Spec: [`docs/PURVIEW_ADAPTER.md`](PURVIEW_ADAPTER.md). This makes DataBard natively
  consumable by every Azure data team: AI-narrated health briefings, dashboards, and
  alerts over their existing Purview catalog.
- **Azure AI Speech evaluation** — neural TTS as a credit-funded fallback/dev tier
  alongside ElevenLabs (which remains the flagship voice quality).
- **Azure Marketplace listing** — once Purview support ships, list DataBard as a
  transactable SaaS offer for co-sell eligibility.

## Migration sequence

| Step | Scope | Effort | Azure services |
|---|---|---|---|
| 1 | Point `OPENAI_*` env at Azure OpenAI | Hours (config only) | Azure OpenAI |
| 2 | Containerize app + sidecar, deploy | 1–2 days | Container Apps, ACR |
| 3 | Blob-backed cache + CDN + cron jobs | 2–3 days | Blob Storage, Front Door, Container Apps Jobs |
| 4 | Purview adapter | 2–3 days | Purview Data Map API |
| 5 | Azure AI Speech fallback tier | 1–2 days | Azure AI Speech |

Steps 1–3 move all existing consumption onto Azure. Steps 4–5 are product roadmap that
deepens the Azure fit.
