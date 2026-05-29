# DataBard — Development Plan

## What We're Building

DataBard turns any OpenMetadata data catalog into a podcast-style audio episode. Two AI voice personas ("Alex" the data advocate, "Morgan" the quality auditor) discuss your schemas, tables, data quality scores, and lineage in a conversational format — like a tech podcast, but about YOUR data.

## Why It Matters

Data documentation is universally neglected. Nobody reads wiki pages about table schemas. DataBard makes documentation consumable — you listen to it like a podcast while commuting, onboarding, or reviewing before a meeting. It's also auto-generated, so it stays current as your catalog changes.

## Target Users

- Data engineers onboarding onto new datasets
- Data team leads who need catalog awareness without clicking through UIs
- Onchain/web3 teams cataloging indexer pipelines, subgraph schemas, DeFi protocol data
- Anyone who'd rather listen than read

## Hackathon Targets

This project is submitted to two concurrent hackathons:

1. **WeMakeDevs × OpenMetadata** (Apr 17–26) — Track T-01: MCP & AI Agents
2. **ElevenHacks Hack #5: Kiro** (Apr 16–23) — Kiro spec-driven dev + ElevenLabs APIs
3. **Pirates of the Coral-bean Hackathon** (May 2026) — "No ETL" cross-source SQL joins with Coral

## Roadmap

### Phase 1: Core (Days 1–3) ← hackathon scope
- [x] Connect to OpenMetadata via REST API
- [x] Fetch schema metadata (tables, columns, quality, lineage, tags)
- [x] Generate two-host conversation script from metadata
- [x] Synthesize audio via ElevenLabs TTS (two voices)
- [x] Episode player with waveform visualization
- [x] Catalog browser UI

### Phase 2: Polish (Days 4–6) ← hackathon scope
- [x] ElevenLabs sound effects for transitions/alerts
- [x] ElevenLabs music generation for intro/outro
- [x] Visual segment timeline (highlights current topic during playback)
- [x] Episode card design (artwork, metadata summary)
- [x] Demo video

### Phase 3: Post-Hackathon & Coral Integration
- [x] Visual health report — server-side PDF export (3 slides: Overview, Critical Tables & Actions, Lineage & Ownership) via `/api/canvas/export` using Puppeteer. No external runtime dependency for users.
- [x] Scheduled regeneration when catalog changes (Pro tier — `/api/schedules` + `/pro` settings UI)
- [x] Shareable episode links / embeds (`/episode/[id]`)
- [x] Monetization: SaaS subscription per data team (Stripe checkout + webhook → Pro activation)
- [x] The Graph subgraph adapter — `src/lib/the-graph-adapter.ts` — introspects GraphQL schema, maps entities→tables, fields→columns, cross-entity refs→lineage
- [x] Dune Analytics adapter — `src/lib/dune-adapter.ts` — fetches query metadata for a namespace, maps queries→tables, result columns→schema, executes non-parameterized queries to compute column statistics (min/max/avg, top values) for data-aware podcast narration
- [x] **Coral Integration (Tier 2 Escape Hatch)** — `src/lib/coral-adapter.ts` — "Bring Your Own Source" via SQL for the long tail of sources without first-class adapters. Cross-source joins, local files, 50+ connectors. See `docs/DATA_SOURCES_ARCHITECTURE.md`.
- [ ] **Coral Graduation Pipeline** — Track which sources users connect via Coral; when a source hits usage threshold, build a first-class Tier 1 adapter with deep metadata extraction.
- [x] Initia InterwovenKit wallet connect — `/pro` page — `.init` wallet as alternative to Stripe customer ID
- [x] On-chain episode minting — `POST /api/onchain/mint` — records schema name, health score, episode ID, author address on Initia testnet
- [ ] Initia appchain deployment — get valid rollup chain ID on `initiation-2` testnet
- [x] Multi-episode playlists (full database series)
- [x] Custom voice cloning for branded docs
- [x] Historical diff intros ("since last week, 2 new failures")

### Paper Canvas (developer tool)
The Paper.design MCP integration in `src/lib/paper-canvas.ts` renders the same 3-slide dashboard onto a live Paper canvas for design iteration. This requires Paper Desktop running locally and is **not** used in the user-facing export path. Use it when iterating on the dashboard layout — the pure HTML builders (`buildOverviewHtml`, `buildCriticalAndActionsHtml`, `buildLineageAndOwnershipHtml`, `buildDashboardHtml`) are the single source of truth for both the Paper preview and the PDF export.
