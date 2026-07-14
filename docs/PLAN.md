# DataBard — Development Plan

## What We're Building

DataBard closes the communication gap between data teams and everyone else. The core product is a **weekly data health briefing** — a 2-minute audio summary plus a dashboard with health scores, trend narratives, and alerts. The dashboard is the hero; the audio is a button on the dashboard.

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
- [x] Default persona changed to enterprise
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
- [x] "Get this for your data" CTA on shared episode pages
- [x] "Want this every Monday?" one-click schedule from dashboard
- [x] "Share this moment" clip feature (15-second audio highlight)
- [x] Email delivery for scheduled digests
- [x] "Roast my data" landing page variant (`/roast`)
- [x] Health score badge (embeddable SVG, `/api/badge/[schema]`)
- [x] Team email recipients for scheduled digests
- [x] Plausible analytics + funnel event tracking

### Phase 6: Solana Accelerator Demo — Done
See [`docs/DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md) for the talk track, click path, and preflight checklist.

- [x] Dashboard redesigned on dither-kit: fleet-health chart (scrub + legend spotlight), generative source avatars, dithered CTAs
- [x] Dashboard-first demo: "Try the demo" seeds deterministic data (`POST /api/demo/seed`) and lands on /protocol; audio is a CTA there
- [x] `/verify` page + `/api/onchain/verify`: decode the SPL-memo attestation, recompute the report hash, show match/mismatch (also renders marketplace settlement receipts)
- [x] `/?persona=onchain` URL param; persona persists across visits
- [x] Onboarding tour moved off the landing hero; decision-support copy
- [x] Leaderboard backfills zero-score mint rows from engine snapshots

### Phase 7: Validation & GTM
- [ ] 5 user interviews with data team leads
- [ ] A/B test CTA ordering (demo vs connect first)
- [ ] Review funnel numbers against targets in [`docs/GTM.md`](GTM.md)
- [ ] Blog post: "We replaced our weekly data report with a podcast"
- [ ] Social content: "AI roasted my database" clips

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
