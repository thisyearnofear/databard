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
- [x] **Coral Graduation Pipeline** — Track which sources users connect via Coral; when a source hits usage threshold, build a first-class Tier 1 adapter with deep metadata extraction.
- [x] On-chain episode minting — Solana Memo Program + PDA registry, SNS identity
- [x] Historical diff intros ("since last week, 2 new failures")

### Phase 4: Marketplace of AI Hosts (Solana × CoralOS hackathon)
See `docs/CORAL_HACKATHON.md` for the full plan.
- [x] **Fork escrow program** — added `deliverable_hash: Option<[u8;32]>` + `commit_delivery` instruction; deployed to devnet as `DCq82m9wgkgQGVqokKmYsvjv9Ym8Lyz8usKvcSwUS3kY`. Settlement proves *what* was delivered, not just that it was paid.
- [x] **Persona sellers** — `voice-config.ts` extended into Signal (premium executive brief), Cascade (mid-tier deep-dive; DataBard's classic voice), Newsroom (discount breaking-changes flash). Each has cost floor + pricing strategy.
- [x] **Market protocol** — `src/lib/market/` (protocol, sellers, buyer, watchdog, orchestrator) owns WANT → BID → AWARD → DEPOSITED → DELIVERED → RELEASED lifecycle.
- [x] **Settlement consolidation** — one `settlement/verifier.ts` interface, three backends (escrow/pusd/stripe). Existing checkout routes now delegate; duplication deleted.
- [x] **Watchdog (machine buyer)** — `/api/market/watchdog?autoDrive=true` fetches schema → computes health delta vs. last snapshot → posts a WANT if delta ≥ threshold → drives the full auction end-to-end. Delta-triggered, not tick-triggered.
- [x] **Public market API** — `POST /api/market/want`, `GET /api/market/bids`, `POST /api/market/award`, `POST /api/market/deliver`, `POST /api/market/deal`. External seller agents can plug in against this contract.
- [ ] **`/market` live auction dashboard** — pitch UI. WANT → three persona bid cards with reasoning → buyer rationale → escrow state pill → episode player as settlement receipt. Explorer links at every state.
- [ ] **Reputation feed** — settled Deals mint to existing `api/onchain/mint-solana` registry; bid card shows persona win count and avg price. Reuses infra, no new store.
- [ ] **Pitch deck + demo video** — 5 slides, 3-min video. Leads with settlement + Explorer link + delivered audio.

### Paper Canvas (developer tool)
The Paper.design MCP integration in `src/lib/paper-canvas.ts` renders the same 3-slide dashboard onto a live Paper canvas for design iteration. This requires Paper Desktop running locally and is **not** used in the user-facing export path. Use it when iterating on the dashboard layout — the pure HTML builders (`buildOverviewHtml`, `buildCriticalAndActionsHtml`, `buildLineageAndOwnershipHtml`, `buildDashboardHtml`) are the single source of truth for both the Paper preview and the PDF export.
