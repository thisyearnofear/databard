# DataBard

**Weekly data health briefings your team actually consumes.**

Data teams produce findings nobody reads. The exec doesn't open Looker. The PM doesn't check dbt tests. The data engineer's Slack message about "the payments table has been stale for 3 days" gets buried. The insight exists but it doesn't *land*.

DataBard closes that gap. Every Monday morning, your team gets a fresh audio briefing on your data health — health scores, what changed, what to fix. No dashboard to check. No report to read. Just press play.

> **[▶ Listen to a demo episode](https://databard.persidian.com)** — no signup required

---

## The Problem

Data health monitoring tools tell you *what's broken*. They don't tell the people who need to know. The result:

- **Data leads spend hours building reports nobody opens.** Dashboards have 47 rows of test results. Execs want a 1-line summary.
- **Issues surface too late.** By the time someone notices the payments table is stale, 8 downstream dashboards are already wrong.
- **Audit trails live in tools auditors can't access.** Compliance wants proof of data quality history. Engineering has it in dbt logs nobody reads.

## The Solution

DataBard is **one analysis engine with outputs people actually consume.** The engine ingests metadata from any source, computes health scores, critical-table rankings, coverage gaps, and trend narratives. Every output — audio briefing, dashboard, alert, audit record — renders from that same analysis.

### The wedge: the weekly digest

The core product is the **scheduled weekly digest.** Every Monday, your team receives:

1. **A 2-minute executive briefing** (audio) — top 3 issues, what changed, recommended actions
2. **A dashboard** with health scores, trend narratives, and drill-down
3. **An alert** if health dropped below your threshold since last week

The audio is the differentiator. It's not a gimmick — it's a forcing function for synthesis. You can't read 47 rows aloud. You have to say "your payments table is stale, 8 dashboards are wrong, and here's what to do." That synthesis is the value.

### The dashboard is the hero

After every analysis, you land on the dashboard — not the audio player. Health scores, critical tables, trend narratives, and "What changed this week" are front and center. The audio is a button on the dashboard: **▶ Listen to this analysis.**

This makes the product feel like an analyst that also talks — not a podcast that also analyzes.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Data Sources                    │
│  OpenMetadata · dbt · The Graph · Dune       │
│  Coral (50+ sources via SQL)                 │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
          ┌──────────────────┐
          │  Analysis Engine  │
          │  Health score     │
          │  Critical tables  │
          │  Trend narratives │
          │  PII / governance │
          └────────┬─────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
  ┌─────────┐ ┌─────────┐ ┌─────────┐
  │Dashboard│ │  Audio  │ │ Alerts  │
  │ (hero)  │ │Briefing │ │Webhook/ │
  │Trends   │ │2-15 min │ │Slack    │
  │Drill-down│ │Exec/Full│ │Email    │
  └─────────┘ └─────────┘ └─────────┘
       │           │           │
       └─────┬─────┘           │
             ▼                 ▼
      ┌────────────┐    ┌────────────┐
      │  Solana    │    │  Weekly    │
      │Attestation │    │  Digest    │
      │(Onchain    │    │  (Pro)     │
      │ persona)   │    │            │
      └────────────┘    └────────────┘
```

**Pipeline:** Connect source → Metadata fetch → Schema analysis (health score, critical tables, trends) → Dashboard (hero) → Audio briefing (button on dashboard) → Optional: schedule weekly, alert on drops, attest on-chain

## Output Formats

| Format | Length | Use case |
|---|---|---|
| **Executive briefing** | 2 min | Monday morning — top 3 issues + actions |
| **Full analysis** | 10-15 min | Deep dive — two AI hosts discuss every finding |
| **Dashboard** | — | Health scores, trends, drill-down (always available) |
| **Alert** | — | Slack/webhook when health drops below threshold |
| **Onchain attestation** | — | Tamper-evident audit trail (Onchain persona) |

## Features

- **Dashboard-first flow** — after analysis, land on the dashboard with health scores and trend narratives. Audio is a button, not the destination.
- **Trend narratives** — "What changed this week" section computes week-over-week diffs and explains them in plain English: "Health dropped 8 points because test coverage fell in the payments schema after the Friday deploy."
- **Executive summary format** — 2-minute briefing with top 3 issues, what changed, and recommended actions. For busy people who want the bottom line.
- **Two-voice AI podcast** — Alex (advocate) and Morgan (auditor) via ElevenLabs. Full analysis mode for deep dives.
- **Alerts** — health threshold monitoring with Slack/webhook notifications. Decoupled from wallet — works with email only.
- **Scheduled weekly digests** — Pro tier. Set up a Monday morning briefing for your team. RSS + email delivery.
- **Onchain attestation** — Solana Memo Program. Tamper-evident audit trail for data quality history. Onchain persona only.
- **Coral integration** — 50+ data sources via SQL. Cross-source joins, no ETL, no data warehouse.
- **Interactive drill-down** — click any segment in the audio player to see columns, tests, lineage, tags.
- **Labs** — experimental features including Data Anthems (data-driven songs). Accessible at [/labs](https://databard.persidian.com/labs).

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

Open [localhost:3000](http://localhost:3000) → Connect → Dashboard with health scores → Listen to briefing.

## Tech Stack

| Layer | Technology |
|---|---|
| Web UI | Next.js 16, React 19, Tailwind CSS 4 |
| Data sources | OpenMetadata REST API, dbt manifest, The Graph, Dune Analytics, Coral (SQL) |
| AI scripts | OpenAI-compatible API (GPT-4o-mini default; Azure OpenAI drop-in — [`docs/AZURE.md`](docs/AZURE.md)) |
| Audio | ElevenLabs TTS (two voices) + Sound Effects |
| Caching | File-backed with TTL (no external dependencies) |
| Payments | Stripe Checkout, Palm USD (Solana SPL stablecoin) |
| Onchain | Solana Memo Program + PDA registry (Onchain persona) |

## Engagement Loops

```
ATTENTION
  ├─ Social post: "AI roasted my database" (shareable clip)
  ├─ Colleague forwards Slack link to shared episode
  └─ Blog post: "We replaced our weekly data report with a podcast"
       │
       ▼
CONVERSION (first "wow" moment)
  ├─ Demo: hears AI hosts discuss sample schema (zero friction)
  ├─ Connects own data → sees health score → hears personal analysis
  └─ "Roast my data" emotional trigger → shares result
       │
       ▼
RETENTION (habit formation)
  ├─ Sets up weekly digest (Monday morning briefing)
  ├─ Alert fires when health drops → comes back to dashboard
  ├─ Trend narrative: "what changed?" → curiosity pull
  └─ Team forwards digest in Slack → social accountability
       │
       ▼
VIRAL (each retention cycle creates new attention)
  ├─ Shared episode link in Slack → 5-20 colleagues click
  ├─ Health score badge in README / team page
  ├─ "Share this moment" clip → social media
  └─ Weekly digest email forwarded to stakeholders
       │
       └─── (loops back to ATTENTION)
```

See [`docs/GTM.md`](docs/GTM.md) for the full go-to-market strategy, viral hooks, and user interview plan.

## Roadmap

### Done
- [x] Dashboard-first flow (land on dashboard after analysis, not player)
- [x] Executive summary format (2-minute briefing)
- [x] Trend narratives ("What changed this week")
- [x] Format picker for all sources (not just Coral)
- [x] Anthem moved to /labs (experimental, not in main flow)
- [x] Alerts page with email-based subscriptions (no wallet required)
- [x] Scheduled weekly digests (Pro tier)
- [x] Onchain attestation (Onchain persona)
- [x] Coral integration (50+ sources via SQL)
- [x] Two-voice AI podcast with ElevenLabs
- [x] Health analytics dashboard with sparklines and trend badges
- [x] Solana on-chain audit trail, leaderboard, team history

### Next — Viral & Retention
- [ ] "Get this for your data" CTA on shared episode pages
- [ ] "Want this every Monday?" one-click schedule from dashboard
- [ ] "Share this moment" clip feature (15-second audio highlight)
- [ ] Email delivery for scheduled digests
- [ ] "Roast my data" landing page variant
- [ ] Health score badge (embeddable SVG for README/team page)
- [ ] Team email recipients for scheduled digests

### Future
- [ ] Azure migration — inference on Azure OpenAI, hosting on Container Apps ([`docs/AZURE.md`](docs/AZURE.md))
- [ ] Microsoft Purview Tier-1 adapter ([`docs/PURVIEW_ADAPTER.md`](docs/PURVIEW_ADAPTER.md))
- [ ] Custom voice personalities
- [ ] Benchmarking — "your health score vs. teams your size"

## Solana Integration

DataBard uses Solana as a verifiable audit trail for the Onchain persona. Every health report can be attested on-chain — a tamper-evident record your team and auditors can verify.

| Feature | Description |
|---|---|
| **Onchain attestation** | Every episode mint writes a memo + PDA record: schema, health score, timestamp, episode ID, wallet |
| **Health alert subscriptions** | Register wallet + schema + threshold + webhook; fires when health drops |
| **Public leaderboard** | Ranked protocols by health score + trend — [/leaderboard](https://databard.persidian.com/leaderboard) |
| **Team history** | Cross-wallet mint history per schema — shared ground truth for post-mortems |
| **Palm USD payments** | Pay for Pro with Palm USD, a non-freezable Solana stablecoin |
| **SNS `.sol` identity** | Wallet address resolved to `.sol` domain on connect |

See [`docs/PALM_USD_INTEGRATION.md`](docs/PALM_USD_INTEGRATION.md) for Palm USD setup.

## ElevenLabs Integration

| Host | Personality | Voice |
|---|---|---|
| **Alex** | Enthusiastic data advocate | George (`JBFqnCBsd6RMkjVDRZzb`) |
| **Morgan** | Skeptical quality auditor | Charlotte (`XB0fDUnXU5powFXDhCwa`) |

Both voices use **context stitching** (`previous_text` / `next_text`) for natural prosody across segment boundaries. Transitions use ElevenLabs Sound Effects API (cached 30 days).

**Setup:**
```bash
# ElevenLabs Starter plan ($5/month) required for API access
ELEVENLABS_API_KEY=sk_your_key_here
```

## License

MIT
