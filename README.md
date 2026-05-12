# 🎙️ DataBard

**Turn your onchain data into AI podcasts and music anthems — then mint them on Solana.**

Connect your Dune queries, subgraph, or data warehouse. Two AI hosts analyze the data, narrate the health story, and generate a shareable episode or a full Data Anthem (music track). Mint the result on Solana under your `.sol` identity.

> **[▶ Listen to a demo episode](https://databard.thisyearnofear.com)** — no signup required · [🎵 Hear a demo anthem](https://databard.thisyearnofear.com)

**Hackathon reviewers:**
- **Colosseum Frontier / 100xDevs Track** → Live product: [databard.thisyearnofear.com](https://databard.thisyearnofear.com) · Solana minting · ElevenLabs Music API · SNS `.sol` identity
- **Palm USD x Superteam UAE** → Native PUSD payment for Pro subscriptions · SPL token transfer on Solana · non-freezable stablecoin checkout · [`docs/PALM_USD_INTEGRATION.md`](docs/PALM_USD_INTEGRATION.md)
- **SNS Identity Track** → `.sol` domain resolved on wallet connect, stored in on-chain memo at mint time
- **OpenMetadata Hackathon** → [`docs/OPENMETADATA_HACKATHON.md`](docs/OPENMETADATA_HACKATHON.md)
- **ZerveHack** → [`docs/ZERVEHACK_PITCH.md`](docs/ZERVEHACK_PITCH.md)

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
- **Monetization-ready** — Stripe checkout, Palm USD (Solana stablecoin), private RSS feeds, cron-ready regeneration

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

### OpenMetadata sandbox mode (no user token required)

If you want users to connect instantly from the frontend using **Use Sandbox**, configure these env vars on the server:

```env
OM_SANDBOX_URL=https://sandbox.open-metadata.org
OM_SANDBOX_TOKEN=your_server_side_sandbox_bot_jwt
NEXT_PUBLIC_OM_SANDBOX_URL=https://sandbox.open-metadata.org
```

- `OM_SANDBOX_URL` and `OM_SANDBOX_TOKEN` are used server-side by `/api/connect` when sandbox mode is selected.
- `NEXT_PUBLIC_OM_SANDBOX_URL` is display-only in the UI.
- Users can still switch to **Connect Your Instance** and provide their own URL/token.

## Tech Stack

| Layer | Technology |
|---|---|
| Web UI | Next.js 15, React 19, Tailwind CSS 4 |
| Metadata | OpenMetadata REST API, dbt manifest parsing, The Graph, Dune Analytics |
| AI Scripts | OpenAI-compatible API (GPT-4o-mini default) |
| Audio | ElevenLabs TTS (two voices) + Sound Effects |
| Caching | File-backed with TTL (no external dependencies) |
| Payments | Stripe Checkout, Palm USD (Solana SPL stablecoin) |
| Onchain | Solana (Memo Program + PDA registry), SNS `.sol` identity, episode minting, health alerts, leaderboard |
| Development | Kiro (spec-driven, see `.kiro/` directory) |

## Solana Integration

DataBard uses Solana not just for minting receipts, but as a genuine utility layer for data teams: queryable audit trails, health alerts, team accountability, gated access, and a public leaderboard.

### Solana Utilities

| Feature | API | Description |
|---|---|---|
| **Palm USD payments** | `POST /api/checkout/palmusd` | Pay for DataBard Pro ($29/mo) using Palm USD, a non-freezable Solana stablecoin. Server builds unsigned SPL transfer → wallet signs → `POST /api/checkout/palmusd/verify` confirms on-chain and activates Pro |
| **On-chain audit trail** | `POST /api/onchain/mint-solana` | Every episode mint writes a memo + PDA record: `(schema_fqn, health_score, timestamp, episode_id, wallet, .sol domain)` — permanently queryable via RPC |
| **Health alert subscriptions** | `POST /api/onchain/alerts` | Register a wallet + schema + threshold + webhook; `GET /api/onchain/check-alerts` fires Slack/webhook when health drops below threshold (cron-ready) |
| **Public leaderboard** | `GET /api/onchain/leaderboard` | Ranked protocols by latest health score, trend (↑↓→), mint count, wallet count — live at [/leaderboard](https://databard.thisyearnofear.com/leaderboard) |
| **Team history** | `GET /api/onchain/team-history` | Cross-wallet mint history for a schema — shared ground truth for post-mortems and handoffs, surfaced in the EpisodePlayer "👥 Team" tab |
| **Gated episode access** | `GET /api/onchain/access` | Episode replay checks wallet ownership of the mint record; non-holders see a wallet-connect nudge |
| **SNS `.sol` identity** | `src/lib/sns.ts` | Wallet address resolved to `.sol` domain on connect; stored in on-chain memo at mint time |

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

DataBard fetches query metadata via the Dune REST API, executes non-parameterized queries in parallel, and computes column statistics (min/max/avg, top values) from result data. This enables data-aware podcast narration — the episode discusses actual numbers and trends, not just schema structure.

### Wallet Connect

```
Landing page → Connect Phantom/Solflare wallet
             → .sol domain resolved via SNS/Bonfida
             → Episodes minted on-chain under your .sol identity
             → Pay for Pro with Palm USD (29 PUSD/mo)
             → Health alerts registered per schema
             → Team history visible across wallets
```

## What's Next

- [x] Two-voice ElevenLabs podcast with sound effects
- [x] Scheduled regeneration (Pro tier, weekly/daily)
- [x] Visual PDF report export (server-side, no dependencies)
- [x] Stripe Pro tier + private RSS feeds
- [x] Onchain data sources (The Graph, Dune Analytics)
- [x] Data Anthems — ElevenLabs Music API, genre/mood mapped to health score
- [x] Solana on-chain audit trail (Memo Program + PDA registry)
- [x] SNS `.sol` identity — resolved on connect, stored in mint memo
- [x] Health alert subscriptions — webhook/Slack when score drops below threshold
- [x] Public leaderboard — ranked protocols by health score + trend
- [x] Team history — cross-wallet mint history per schema
- [x] Gated episode access — wallet ownership check before replay
- [x] Palm USD payments — non-freezable stablecoin checkout for Pro subscriptions
- [ ] Historical diff intros ("since last week, 2 new failures")
- [ ] Custom Anchor program for richer on-chain PDA queries
- [ ] Custom voice personalities

## Palm USD Integration

DataBard accepts [Palm USD (PUSD)](https://palmusd.com) as a native payment method for Pro subscriptions. Palm USD is a non-freezable, 1:1 USD-backed stablecoin on Solana — no admin key can seize, pause, or reverse a transaction.

### Why Palm USD?

- **Non-freezable** — no blacklist, no pause function, no clawback. Your subscription payment can never be censored.
- **1:1 USD backed** — AED & SAR reserves held at regulated custodians, attested monthly (ISAE 3000).
- **Native on Solana** — SPL token with sub-second finality. No bridges, no wrapped assets.
- **24/7 settlement** — no weekends, no holidays, no cut-off times.

### Payment Flow

```
User clicks "Pay with Palm USD"
  → Connect Solana wallet (Phantom, Solflare)
  → Server builds unsigned SPL token transfer (29 PUSD → DataBard treasury)
  → User signs in wallet
  → Transaction submitted to Solana
  → Server verifies on-chain confirmation
  → Pro access activated instantly
```

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/checkout/palmusd` | POST | Builds unsigned PUSD transfer transaction. Body: `{ walletAddress }` |
| `/api/checkout/palmusd/verify` | POST | Verifies on-chain payment, activates Pro. Body: `{ walletAddress, txSignature }` |

### Configuration

```env
# Solana network (mainnet-beta for production)
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Palm USD SPL token mint address (Solana mainnet)
NEXT_PUBLIC_PALM_USD_MINT=CZzgUBvxaMLwMhVSLgqJn3npmxoTo6nzMNQPAnwtHF3s

# Your treasury wallet that receives PUSD payments
PALM_USD_RECIPIENT=your_solana_wallet_address
```

### Contract Details

| Chain | Address | Type |
|---|---|---|
| Solana | `CZzgUBvxaMLwMhVSLgqJn3npmxoTo6nzMNQPAnwtHF3s` | SPL Token (6 decimals) |

For more details, see [`docs/PALM_USD_INTEGRATION.md`](docs/PALM_USD_INTEGRATION.md).

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
