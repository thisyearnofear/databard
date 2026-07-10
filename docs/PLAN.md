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

### Phase 5: Viral Hooks & Retention — Next
- [ ] "Get this for your data" CTA on shared episode pages
- [ ] "Want this every Monday?" one-click schedule from dashboard
- [ ] "Share this moment" clip feature (15-second audio highlight)
- [ ] Email delivery for scheduled digests
- [ ] "Roast my data" landing page variant
- [ ] Health score badge (embeddable SVG for README/team page)
- [ ] Team email recipients for scheduled digests
- [ ] PostHog/Plausible analytics on landing page funnels

### Phase 6: Validation & GTM
- [ ] 5 user interviews with data team leads
- [ ] A/B test CTA ordering (demo vs connect first)
- [ ] Instrument the funnel: landing → demo → connect → generate → schedule
- [ ] Blog post: "We replaced our weekly data report with a podcast"
- [ ] Social content: "AI roasted my database" clips

### Phase 7: Future
- [ ] Azure migration — inference on Azure OpenAI, hosting on Container Apps ([`docs/AZURE.md`](docs/AZURE.md))
- [ ] Microsoft Purview Tier-1 adapter ([`docs/PURVIEW_ADAPTER.md`](docs/PURVIEW_ADAPTER.md))
- [ ] Custom voice personalities
- [ ] Benchmarking — "your health score vs. teams your size"
- [ ] Custom Anchor program for richer on-chain PDA queries

## Paper Canvas (developer tool)
The Paper.design MCP integration in `src/lib/paper-canvas.ts` renders the same 3-slide dashboard onto a live Paper canvas for design iteration. This requires Paper Desktop running locally and is **not** used in the user-facing export path. Use it when iterating on the dashboard layout — the pure HTML builders (`buildOverviewHtml`, `buildCriticalAndActionsHtml`, `buildLineageAndOwnershipHtml`, `buildDashboardHtml`) are the single source of truth for both the Paper preview and the PDF export.
