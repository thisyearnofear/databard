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
- [ ] Multi-episode playlists (full database series)
- [ ] Scheduled regeneration when catalog changes
- [ ] Custom voice cloning for branded docs
- [ ] Onchain minting of audio docs as versioned NFTs
- [ ] Shareable episode links / embeds
- [ ] Monetization: SaaS subscription per data team
