# DataBard — Development Plan

## What We're Building

DataBard is an AI data analyst that monitors your data estate, synthesises what it finds, and acts on it. The core product is a **synthesis engine** that connects to any data source, computes health scores, generates trend narratives, and recommends next steps. Audio briefings, dashboards, alerts, and (next) automated actions are all output formats of that engine. The agent layer is the product; the outputs are how it reaches you.

## Why It Matters

Data teams produce findings nobody reads. Dashboards have 47 rows of test results. Execs want a 1-line summary. DataBard's synthesis engine distills metadata from any source into outputs people actually consume: audio briefings, dashboards with trend narratives, and alerts that find you.

## Target Users

- **Data team leads** who spend hours building reports nobody opens
- **Execs and PMs** who want the bottom line, not the raw test results
- **Onchain/web3 teams** who need publicly verifiable protocol health
- **Anyone who'd rather hear a 2-minute summary than read a dashboard**

## Roadmap

### Phase 1: Core (hackathon) — Done
- [x] Connect to OpenMetadata via REST API
- [x] Fetch schema metadata (tables, columns, quality, lineage, tags)
- [x] Generate two-host conversation script from metadata
- [x] Synthesize audio via ElevenLabs TTS (two voices)
- [x] Episode player with waveform visualization
- [x] Catalog browser UI

### Phase 2: Polish & Expansion — Done
- [x] ElevenLabs sound effects for transitions
- [x] Visual segment timeline
- [x] Shareable episode links / embeds (`/episode/[id]`)
- [x] Monetization: Stripe Pro tier
- [x] The Graph + Dune Analytics adapters
- [x] Coral integration (50+ sources via SQL)
- [x] Solana on-chain attestation (Memo Program + PDA registry)
- [x] Scheduled regeneration (Pro tier)
- [x] Historical diff intros ("since last week, 2 new failures")

### Phase 3: Analysis-First Repositioning — Done
- [x] Landing page rewritten: analysis-first hero, live dashboard stats, three pillars
- [x] Default persona initially set to enterprise (later flipped to Protocols beachhead — Phase 6.8)
- [x] Alerts page with email-based subscriptions (decoupled from wallet)
- [x] Alert badges on protocol dashboard cards
- [x] Executive summary output format (2-minute briefing)
- [x] Format picker for all sources (not just Coral)
- [x] Schedule form with output format selector
- [x] Auto-attest weekly digests for wallet-connected Pro accounts

### Phase 4: Dashboard-First + Trend Narratives — Done
- [x] After generation, land on /protocol dashboard (not episode player)
- [x] "Listen to this analysis" button on dashboard
- [x] Anthem removed from main flow, moved to /labs
- [x] Format picker narrowed to 2 options (Full analysis / Executive briefing)
- [x] Format picker added for non-Coral sources (OpenMetadata, dbt, etc.)
- [x] Trend narrative API (`/api/insights/trends`)
- [x] "What changed this week" section on dashboard
- [x] Trend narratives in executive summary format
- [x] Onchain page reframed as "Onchain Primitives" showcase
- [x] Coral showcase section on landing page
- [x] Coral presets expanded (stale PRs, bug triage)

### Phase 5: Viral Hooks & Retention — Done
- [x] CTA on shared episode / score-card pages
- [x] Monday signup on the finding (later refined in Phase 6.8; Pro still for multi-schema)
- [x] Share card / clip feature (refined to score-card OG in Phase 6.8)
- [x] Email delivery for scheduled digests
- [x] "Roast my data" landing page variant (`/roast`)
- [x] Health score badge (embeddable SVG, `/api/badge/[schema]`)
- [x] Team email recipients for scheduled digests
- [x] Plausible analytics + funnel event tracking

### Phase 6: Solana Accelerator Demo — Done
See [`docs/DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md) for the talk track, click path, and preflight checklist.

- [x] Dashboard redesigned on dither-kit: fleet-health chart (scrub + legend spotlight), generative source avatars, dithered CTAs
- [x] Dashboard-first demo: "Try the demo" seeds deterministic data (`POST /api/demo/seed`); Protocols land on `/league`, Teams on `/protocol`
- [x] `/verify` page + `/api/onchain/verify`: decode the SPL-memo attestation, recompute the report hash, show match/mismatch (also renders marketplace settlement receipts)
- [x] Teams/Protocols workspace model: `/` defaults to **Protocols**; Teams hides wallet chrome
- [x] Wallet provider loads only for Protocols dashboard and on-chain routes (not shared score-card pages)
- [x] Dashboard broken into briefing components (`DashboardHeader`, `PriorityBriefingCard`, `DashboardSummary`, `ChangeNarratives`, `SourceHealthList`) with shared health logic in `src/lib/briefing-health.ts`
- [x] `/?workspace=protocols` URL param; legacy `?persona=onchain` still maps to Protocols
- [x] Onboarding tour moved off the landing hero; decision-support copy
- [x] Leaderboard backfills zero-score mint rows from engine snapshots

### Phase 6.5: UI/UX Catch-Up — Match the Demo Video
- [x] Dark-first theme enforced as default (`data-theme="dark"` on `<html>`, removed `prefers-color-scheme: light` override); light mode still available via ThemeToggle
- [x] Landing page: added browser-framed dashboard screenshot to break up the text wall
- [x] Leaderboard rebuilt: sorting (score/change/recent), filter toggle (all/verified/scanned), search, stats summary bar, styled claim buttons, improved row design, empty states
- [x] History page: episode count and recent episode previews shown above the wallet gate; "What is this?" explainer added; gate reframed as "Connect to see your full history"
- [x] Wizard context split: 538-line monolith decomposed into `wizard-types.ts` (types + initialState), `wizard-reducer.ts` (5 domain reducers), `wizard-effects.ts` (5 extracted effect hooks), slim `wizard-context.tsx` (provider only)
- [x] Fixed infinite render loop from unstable `onReady` callback in persona sync effect

### Phase 6.7: OKX.AI ASP + A2MCP — Done
- [x] `POST /api/mcp/health-check` — free A2MCP tool (health score + recommended actions, no LLM/audio)
- [x] `POST /api/mcp/briefing` — paid A2MCP tool (x402 EIP-3009 USDT0 on X Layer, default $1.00/call)
- [x] `POST /api/mcp/writeback` — free A2MCP tool (writes findings back into DataHub context graph)
- [x] `GET /api/mcp/tools` — service discovery (tool list + JSON input/output schemas)
- [x] x402 server setup (`src/lib/x402.ts`) — OKX Payment SDK, `syncSettle: true`, 503 on misconfigured deploy
- [x] ASP #9878 registered on OKX.AI (X Layer, chainIndex 196); services attached (`Data Health Check` id 37750, `Data Briefing` id 37751); submitted for final OKX review
- [x] Episode persistence via Lens Protocol Grove (`src/lib/grove-storage.ts`) — IPFS-backed, immutable ACL
- [x] `DATABARD_DATA_DIR` production guard (`src/lib/data-dir.ts`) — throws at startup without it, preventing process.cwd() bundle trace blowup
- [x] Bundle size guard (`scripts/check-bundle-size.mjs`) — fails build if `.next/standalone/` exceeds 120MB; current healthy size ~85MB

### Phase 6.8: Protocol Growth Loop — Done
Beachhead = Protocols (interest is web3-heavy). Close the viral/retention loop without burying attestation.

- [x] Default workspace Protocols; landing proof = live declining finding or seeded Orca drop
- [x] Public `/league` + `/api/league` + `/api/og/league` (sample roster when no live scan — honesty in copy)
- [x] Share as a **score card** (OG + quote + ~15s audio); shared TTL 21 days; no wallet on `/episode/[id]`
- [x] Protocols demo lands on `/league?from=demo` (claim row / listen)
- [x] Monday email on the finding (`MondaySignup`) — habit before `/pro`
- [x] Prod stay-alive: `scripts/ensure-running.sh` cron + `docs/OPERATIONS.md` shared-PM2 notes

### Phase 7: Validation & GTM
- [ ] 5 user interviews (protocol teams first; data team leads as expansion)
- [ ] Monday live-scan cron so `/league` is not sample-only
- [ ] A/B test CTA ordering (demo vs connect first)
- [ ] Review funnel numbers against targets in [`docs/GTM.md`](GTM.md)
- [ ] Blog / social from league editions (see [`docs/CONTENT_PLAYBOOK.md`](CONTENT_PLAYBOOK.md))
- [ ] Wait for OKX final approval (status flips to "listed" — check with `onchainos agent get-agents --agent-ids 9878`)
- [ ] Record 90s X demo post with `#OKXAI` (shot list in [`docs/OKX_AI_ASP.md`](OKX_AI_ASP.md))

### Phase 8: Field-Sales Allocation Discovery — Validate Before Building

See [`docs/FIELD_SALES_ALLOCATION.md`](FIELD_SALES_ALLOCATION.md). This is a separate vertical experiment, not a replacement for the data-health roadmap.

- [ ] Run one controlled pilot with a field-sales organisation; start with reviewed account, activity, and commercial outcome exports
- [ ] Define the canonical account, representative, activity, opportunity, and accounting-outcome model with the pilot customer
- [ ] Build a reviewable account-identity matching workflow; surface uncertain matches instead of silently merging records
- [ ] Back-test coverage and allocation hypotheses against historical orders, invoices, payments, credits, renewals, or another agreed outcome
- [ ] Produce a manager-reviewable allocation briefing: under-covered high-potential accounts, capacity mismatches, recommended action, evidence, and confidence
- [ ] Track recommendation adoption and outcome against a pre-agreed baseline or comparable cohort
- [ ] Validate the actual activity source before building an integration: CRM, email, WhatsApp, calendar, manager report, or another system
- [ ] Define data-access, retention, deletion, audit-log, and performance-decision safeguards with the pilot customer
- [ ] Defer live Xero/QuickBooks integrations and zero-knowledge proofs until a pilot demonstrates a specific, recurring need

### Phase 9: Future
- [ ] Azure migration — inference on Azure OpenAI, hosting on Container Apps ([`docs/AZURE.md`](docs/AZURE.md))
- [ ] Microsoft Purview Tier-1 adapter ([`docs/PURVIEW_ADAPTER.md`](docs/PURVIEW_ADAPTER.md))
- [ ] Custom voice personalities
- [ ] Benchmarking — "your health score vs. teams your size"
- [ ] Custom Anchor program for richer on-chain PDA queries

## Paper Canvas (developer tool)
The Paper.design MCP integration in `src/lib/paper-canvas.ts` renders the same 3-slide dashboard onto a live Paper canvas for design iteration. This requires Paper Desktop running locally and is **not** used in the user-facing export path. Use it when iterating on the dashboard layout — the pure HTML builders (`buildOverviewHtml`, `buildCriticalAndActionsHtml`, `buildLineageAndOwnershipHtml`, `buildDashboardHtml`) are the single source of truth for both the Paper preview and the PDF export.
