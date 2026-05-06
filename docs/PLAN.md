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

## Roadmap

### Phase 1: Core (Days 1–3) ← hackathon scope
- [ ] Connect to OpenMetadata via REST API
- [ ] Fetch schema metadata (tables, columns, quality, lineage, tags)
- [ ] Generate two-host conversation script from metadata
- [ ] Synthesize audio via ElevenLabs TTS (two voices)
- [ ] Episode player with waveform visualization
- [ ] Catalog browser UI

### Phase 2: Polish (Days 4–6) ← hackathon scope
- [ ] ElevenLabs sound effects for transitions/alerts
- [ ] ElevenLabs music generation for intro/outro
- [ ] Visual segment timeline (highlights current topic during playback)
- [ ] Episode card design (artwork, metadata summary)
- [ ] Demo video

### Phase 3: Post-Hackathon
- [x] Visual health report — server-side PDF export (3 slides: Overview, Critical Tables & Actions, Lineage & Ownership) via `/api/canvas/export` using Puppeteer. No external runtime dependency for users.
- [x] Scheduled regeneration when catalog changes (Pro tier — `/api/schedules` + `/pro` settings UI)
- [x] Shareable episode links / embeds (`/episode/[id]`)
- [x] Monetization: SaaS subscription per data team (Stripe checkout + webhook → Pro activation)
- [x] The Graph subgraph adapter — `src/lib/the-graph-adapter.ts` — introspects GraphQL schema, maps entities→tables, fields→columns, cross-entity refs→lineage
- [x] Dune Analytics adapter — `src/lib/dune-adapter.ts` — fetches query metadata for a namespace, maps queries→tables, result columns→schema, executes non-parameterized queries to compute column statistics (min/max/avg, top values) for data-aware podcast narration
- [x] Initia InterwovenKit wallet connect — `/pro` page — `.init` wallet as alternative to Stripe customer ID
- [x] On-chain episode minting — `POST /api/onchain/mint` — records schema name, health score, episode ID, author address on Initia testnet
- [ ] Initia appchain deployment — get valid rollup chain ID on `initiation-2` testnet
- [ ] Multi-episode playlists (full database series)
- [ ] Custom voice cloning for branded docs

### Paper Canvas (developer tool)
The Paper.design MCP integration in `src/lib/paper-canvas.ts` renders the same 3-slide dashboard onto a live Paper canvas for design iteration. This requires Paper Desktop running locally and is **not** used in the user-facing export path. Use it when iterating on the dashboard layout — the pure HTML builders (`buildOverviewHtml`, `buildCriticalAndActionsHtml`, `buildLineageAndOwnershipHtml`, `buildDashboardHtml`) are the single source of truth for both the Paper preview and the PDF export.
