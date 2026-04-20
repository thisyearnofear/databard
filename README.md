# 🎙️ DataBard

**Your data catalog, as a podcast.**

Two AI hosts walk through your OpenMetadata schemas, flag failing tests, trace lineage, call out PII columns, and debate what needs fixing — so your team actually knows what's in the warehouse.

> **[▶ Listen to a demo episode](https://databard.vercel.app)** — no signup required

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

**Pipeline:** Metadata fetch → Schema analysis → Script generation (LLM or template) → Streaming audio synthesis → Interactive player with data drill-down

## Features

- **Deep OpenMetadata integration** — owners, PII, glossary, profiler, quality, lineage
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
# Add your ELEVENLABS_API_KEY (required)
# Add OPENAI_API_KEY for LLM scripts (optional)
npm run dev
```

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
| Metadata | OpenMetadata REST API, dbt manifest parsing |
| AI Scripts | OpenAI-compatible API (GPT-4o-mini default) |
| Audio | ElevenLabs TTS (two voices) + Sound Effects |
| Caching | File-backed with TTL (no external dependencies) |
| Payments | Stripe Checkout |
| Development | Kiro (spec-driven, see `.kiro/` directory) |

## What's Next

- [ ] Real-time demo episode with ElevenLabs voices
- [ ] Vercel deployment with KV cache
- [ ] Scheduled regeneration via Vercel Cron
- [ ] Historical comparison ("last week 3 failures, this week 7")
- [ ] Slack integration for episode drops
- [ ] Custom voice personalities

## License

MIT
