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
- **Multiple audio providers** — Direct API (recommended) or browser automation fallback
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
| Metadata | OpenMetadata REST API, dbt manifest parsing |
| AI Scripts | OpenAI-compatible API (GPT-4o-mini default) |
| Audio | ElevenLabs TTS (two voices) + Sound Effects |
| Caching | File-backed with TTL (no external dependencies) |
| Payments | Stripe Checkout |
| Development | Kiro (spec-driven, see `.kiro/` directory) |

## What's Next

- [ ] Real-time demo episode with ElevenLabs voices (requires paid API plan)
- [ ] Vercel deployment with KV cache
- [ ] Scheduled regeneration via Vercel Cron
- [ ] Historical comparison ("last week 3 failures, this week 7")
- [ ] Slack integration for episode drops
- [ ] Custom voice personalities

## Audio Generation & Browser Automation

DataBard uses ElevenLabs for text-to-speech. For the best experience, we recommend a **paid ElevenLabs plan** ($5/month Starter) which unlocks full API access to all voices.

### ElevenLabs API Tiers

| Tier | API Access | Voices Available | Best For |
|---|---|---|---|
| **Free** | ❌ No API access | Web UI only | Testing the web interface |
| **Starter ($5/mo)** | ✅ Full API | All premade voices | Development & production |
| **Creator ($22/mo)** | ✅ Full API | All voices + cloning | Professional use |

**Important**: Free tier ElevenLabs accounts cannot use ANY voices via API, even premade ones. The API returns 402 "payment_required" for all voice requests on free tier.

### Browser Automation Fallback (Experimental)

For free tier users or as a fallback, DataBard includes browser automation that can use the ElevenLabs web UI. However, **this requires authentication** and is slower than the API.

#### Three Browser Automation Options

| Provider | Type | Speed | Cost | Authentication | Setup |
|---|---|---|---|---|---|
| **agent-browser** | Local Rust CLI | Fast | Free | Required | `npm install -g agent-browser && agent-browser install` |
| **browser-use CLI** | Local Python | Fast | Free | Can reuse Chrome login | `curl -fsSL https://browser-use.com/cli/install.sh \| bash` |
| **TinyFish** | Cloud AI Agent | Medium | Pay-per-use | Required | Set `TINYFISH_API_KEY` |

#### Configuration

```bash
# Option 1: Auto-detect (default) - tries providers in order
BROWSER_PROVIDER=auto

# Option 2: agent-browser (Vercel Labs - Rust CLI)
BROWSER_PROVIDER=agent-browser
npm install -g agent-browser
agent-browser install

# Option 3: browser-use CLI (Python-based)
BROWSER_PROVIDER=browser-use-cli
curl -fsSL https://browser-use.com/cli/install.sh | bash

# Option 4: TinyFish (Cloud AI)
BROWSER_PROVIDER=tinyfish
TINYFISH_API_KEY=sk-tinyfish-your_key_here

# Option 5: Browser Use Cloud API
BROWSER_PROVIDER=browser-use
BROWSER_USE_API_KEY=your_key_here
```

#### How It Works

1. **API First**: Tries the ElevenLabs REST API
2. **402 Detection**: If API returns "payment_required", falls back to browser automation
3. **Provider Selection**: Uses configured provider (or auto-detects first available)
4. **Web UI Automation**: Navigates to ElevenLabs, fills form, generates audio
5. **Audio Extraction**: Downloads generated MP3 and returns to client

#### Limitations

- **Authentication Required**: ElevenLabs web UI requires login (CAPTCHA may block automation)
- **Slower**: ~30s per segment vs ~5s via API
- **Less Reliable**: Web UI changes can break automation
- **Rate Limits**: Web UI has stricter rate limits than API

#### Check Provider Status

```bash
curl http://localhost:3000/api/providers
# Returns: { "configured": "auto", "available": ["agent-browser"], "recommendation": "agent-browser" }
```

### Recommended Setup

**For Development & Production:**
```bash
# 1. Get ElevenLabs Starter plan ($5/month)
# 2. Add API key to .env
ELEVENLABS_API_KEY=sk_your_key_here

# 3. Use premade voices (free tier compatible)
# Alex: Antoni (ErXwobaYiN019PkySvjV)
# Morgan: Rachel (21m00Tcm4TlvDq8ikWAM)
```

**For Testing Without Payment:**
```bash
# Install local browser automation
npm install -g agent-browser
agent-browser install

# Set provider
BROWSER_PROVIDER=agent-browser

# Note: You'll need to manually log in to ElevenLabs
# in the browser when prompted
```

## License

MIT
