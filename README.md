# 🎙️ DataBard

**Your data catalog, as a question-first podcast.**

Start with a question, connect OpenMetadata, dbt, The Graph, or Dune, and let the agent turn the analysis into a podcast-style answer your team can actually consume.

> **[▶ Listen to a demo episode](https://databard.vercel.app)** — no signup required

If you're reviewing this for a hackathon, see [`docs/ZERVEHACK_PITCH.md`](docs/ZERVEHACK_PITCH.md) for the submission-ready summary and demo flow.

---

## The Problem

Data catalogs have hundreds of tables. Nobody reads the docs. Quality tests fail silently. New team members take weeks to understand the warehouse. The metadata is there — but nobody consumes it.

## The Solution

DataBard generates podcast-style audio episodes from your OpenMetadata instance. Two AI hosts — Alex (the enthusiast) and Morgan (the skeptic) — have a natural conversation about your schemas, surfacing insights that matter:

- 🔴 **"orders has 3 failing tests and 8 downstream dependents — if this breaks, it cascades"**
- 🔒 **"Governance flag: customers has PII columns — email, phone_number"**
- 👤 **"This table is owned by the analytics team. Hey analytics team, your tests are failing"**
- 📊 **"Health score 58 out of 100. Only 50% test coverage. Let's talk about what's broken."**
- 🕐 **"events hasn't been updated in 36 hours. Are the pipelines running?"**

Click any segment to drill down into the actual columns, tests, lineage, and tags.

## How It Uses OpenMetadata

DataBard deeply integrates with OpenMetadata's API surface:

| API | What DataBard Does With It |
|---|---|
| **Tables** (columns, tags) | Discusses schema structure, column types, data modeling choices |
| **Data Quality / Test Cases** | Flags failures, computes health scores, identifies cascading risks |
| **Lineage** | Maps data flow, identifies hotspots, warns about upstream failures |
| **Owners** | Names who's responsible for broken tables |
| **Profiler Data** | Reports row counts, flags stale tables by freshness timestamps |
| **Glossary Terms** | Highlights business context baked into metadata |
| **Classification (PII/Sensitive)** | Governance alerts for columns with PII tags |
| **Database Schemas** | Schema descriptions, catalog browsing |

The analysis layer computes **health scores**, **critical table rankings** (failing tests × downstream dependents), **coverage gaps**, and **lineage hotspots** before generating the script.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│ OpenMetadata │────▶│   Analysis   │────▶│   Script    │────▶│  Audio   │
│  dbt Cloud   │     │ Health score │     │ LLM / tmpl  │     │ ElevenLabs│
│  dbt Local   │     │ Critical tbl │     │ Two hosts   │     │ TTS + SFX │
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

**Pipeline:** Question → Metadata fetch → Schema analysis → Script generation (LLM or template) → Streaming audio synthesis → Interactive player with data drill-down

## Features

- **Deep OpenMetadata integration** — owners, PII, glossary, profiler, quality, lineage
- **Question-first analysis** — Zerve-aligned workflow that starts from a research prompt, not a blank script
- **Research trail** — each answer now includes a plan, evidence, and recommended next actions
- **Two-voice AI podcast** — Alex (advocate) and Morgan (auditor) via ElevenLabs
- **LLM-powered scripts** — GPT-4o-mini generates natural dialogue (template fallback)
- **Interactive drill-down** — click any segment to see columns, tests, lineage, tags
- **Health scoring** — 0-100 score based on test coverage, failures, documentation, freshness
- **Streaming synthesis** — start listening while audio generates
- **Multi-platform sharing** — WhatsApp, Telegram, Twitter, native share sheet, RSS feed
- **MP3 download** — take episodes offline
- **Smart caching** — SFX cached 30 days, speech 24hr, scripts 1hr, metadata 5-10min
- **Rate limiting** — 5 episodes/hr per IP to protect API credits
- **OG images** — dynamic social preview cards for shared episodes
- **Monetization-ready** — Stripe checkout, private RSS feeds, cron-ready regeneration

## Quick Start

```bash
git clone https://github.com/thisyearnofear/databard.git
cd databard
npm install

cp .env.example .env
# Add your ELEVENLABS_API_KEY (Starter plan or higher recommended)
# Add OPENAI_API_KEY for LLM scripts (optional)
npm run dev
```

**ElevenLabs Setup:**
1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Upgrade to Starter plan ($5/month) for API access
3. Get your API key from Profile → API Keys
4. Add to `.env`: `ELEVENLABS_API_KEY=sk_your_key_here`

**OpenMetadata setup:**
```bash
curl -sL -o docker-compose-postgres.yml \
  https://github.com/open-metadata/OpenMetadata/releases/download/1.10.4-release/docker-compose-postgres.yml
docker compose -f docker-compose-postgres.yml up --detach
```

Open [localhost:3000](http://localhost:3000) → Connect → Select a schema → Listen.

## Tech Stack

| Layer | Technology |
|---|---|
| Web UI | Next.js 15, React 19, Tailwind CSS 4 |
| Metadata | OpenMetadata REST API, dbt manifest parsing, The Graph, Dune Analytics |
| AI Scripts | OpenAI-compatible API (GPT-4o-mini default) |
| Audio | ElevenLabs TTS (two voices) + Sound Effects |
| Caching | File-backed with TTL (no external dependencies) |
| Payments | Stripe Checkout |
| Onchain | Initia InterwovenKit, episode minting on Initia testnet |
| Development | Kiro (spec-driven, see `.kiro/` directory) |

## Initia Integration

DataBard is being built for the [Initia INITIATE hackathon](https://docs.initia.xyz/hackathon) (AI track). The integration adds onchain identity and data provenance to audio documentation.

### What's Integrated

| Feature | Status | Details |
|---|---|---|
| **InterwovenKit wallet connect** | ✅ Live | `/pro` page — connect `.init` wallet as alternative to Stripe customer ID |
| **On-chain episode minting** | ✅ Stub (appchain pending) | `POST /api/onchain/mint` — records schema name, health score, episode ID, author address |
| **The Graph data source** | ✅ Live | Connect any subgraph endpoint — entities become tables, fields become columns |
| **Dune Analytics data source** | ✅ Live | Connect Dune namespace — queries become tables, result columns become schema |
| **Appchain deployment** | 🔄 In progress | Targeting Initia testnet `initiation-2` |

### Onchain Data Sources

DataBard natively supports onchain data catalogs alongside traditional ones:

```
# The Graph — paste any subgraph URL
Source: The Graph (subgraph)
URL: https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3

# Dune Analytics — connect your query namespace
Source: Dune Analytics
API Key: <from dune.com/settings/api>
Namespace: uniswap
```

DataBard introspects the GraphQL schema, maps entity types to tables, and generates an audio episode about your protocol's data health — the same way it does for dbt and OpenMetadata.

### Wallet Connect (Pro Page)

```
/pro → Connect Initia Wallet (.init)
     → Authenticate with .init username
     → Episodes generated while connected are recorded on-chain
```

### Submission

See `.initia/submission.json` for full submission metadata.

Demo video: TBD — to be recorded before final submission.

## What's Next

- [x] Two-voice ElevenLabs podcast with sound effects
- [x] Scheduled regeneration (Pro tier, weekly/daily)
- [x] Visual PDF report export (server-side, no dependencies)
- [x] Stripe Pro tier + private RSS feeds
- [x] Onchain data sources (The Graph, Dune Analytics)
- [ ] Historical diff intros ("since last week, 2 new failures")
- [ ] Slack integration for episode drops
- [ ] Custom voice personalities

## ElevenLabs Integration

DataBard uses ElevenLabs as its core audio engine — not just for TTS, but for the full production audio experience:

### Voices

| Host | Personality | ElevenLabs Voice | Voice ID |
|---|---|---|---|
| **Alex** | Enthusiastic data advocate | George | `JBFqnCBsd6RMkjVDRZzb` |
| **Morgan** | Skeptical quality auditor | Charlotte | `XB0fDUnXU5powFXDhCwa` |

Both voices use **context stitching** (`previous_text` / `next_text`) for natural prosody across segment boundaries — the conversation flows like a real podcast, not a sequence of isolated TTS clips.

### Sound Effects

Transitions between topics use ElevenLabs' **Sound Effects API** (`textToSoundEffects.convert()`). Each transition prompt is generated dynamically based on the topic shift:

```typescript
// e.g. moving from quality failures to lineage section
await elevenlabs.textToSoundEffects.convert({
  text: "subtle data pipeline whoosh transition",
  duration_seconds: 1.5,
});
```

SFX are cached for 30 days to avoid redundant API calls.

### Audio Pipeline

```
Script segments → ElevenLabs TTS (per segment, with context stitching)
                → ElevenLabs SFX (per transition)
                → Concatenated MP3 (streamed to client)
                → Cached 24hr
```

### Setup

```bash
# ElevenLabs Starter plan ($5/month) required for API access
ELEVENLABS_API_KEY=sk_your_key_here
```

| Tier | API Access | Best For |
|---|---|---|
| **Free** | ❌ No API | Web UI only |
| **Starter ($5/mo)** | ✅ Full API | Development & production |
| **Creator ($22/mo)** | ✅ Full API + cloning | Custom voices |

## License

MIT
