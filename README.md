# DataBard 🎙️

Generative podcast-style audio documentation for your data catalog.

Point DataBard at any data catalog (OpenMetadata, dbt Cloud, or local dbt) and it generates a two-host podcast episode that walks through your schemas, tables, data quality scores, and lineage — with AI voices debating tradeoffs and flagging issues.

## Features

- **Multiple data sources** — OpenMetadata, dbt Cloud API, or local dbt manifest.json
- **Two-voice AI podcast** — Two distinct ElevenLabs voices discuss your data catalog like co-hosts
- **Streaming synthesis** — Start listening while audio generates (no waiting for full episode)
- **Smart caching** — Metadata and episodes cached to reduce API calls and speed up regeneration
- **Visual episode cards** — Waveform animations and episode artwork as audio plays
- **Sound design** — ElevenLabs-generated intro jingles, transitions, and alert stings for quality issues
- **Shareable episodes** — One-click sharing with unique URLs (24hr expiry)
- **Schema search** — Filter large catalogs to find the schema you need

## Tech Stack

- **Next.js** — Web UI with episode cards, waveform visualization, catalog browser
- **OpenMetadata / dbt** — Metadata fetching via REST API or manifest parsing
- **ElevenLabs** — Text-to-Speech (two voices), Sound Effects, Music Generation
- **Kiro** — Spec-driven development (see `.kiro/` directory)

## Getting Started

### Prerequisites

- Node.js 18+
- ElevenLabs API key
- One of:
  - Docker Desktop (for local OpenMetadata)
  - dbt Cloud account with API access
  - Local dbt project with compiled manifest.json

### Setup

```bash
# Install dependencies
npm install

# Copy env template
cp .env.example .env
# Add your ELEVENLABS_API_KEY

# Run the app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Data Source Setup

**OpenMetadata:**
```bash
# Start OpenMetadata locally
curl -sL -o docker-compose-postgres.yml https://github.com/open-metadata/OpenMetadata/releases/download/1.10.4-release/docker-compose-postgres.yml
docker compose -f docker-compose-postgres.yml up --detach
```

**dbt Cloud:**
- Get your Account ID and Project ID from dbt Cloud URL
- Generate an API token from Account Settings → API Access

**dbt Local:**
- Run `dbt compile` in your dbt project
- Point DataBard to `./target/manifest.json`

## How Kiro Was Used

See the `.kiro/` directory for specs, hooks, and steering docs that guided development.

## Roadmap

- [x] Multi-source support (OpenMetadata, dbt Cloud, dbt local)
- [x] Streaming synthesis (start playback immediately)
- [x] Smart caching (reduce API calls)
- [x] Episode sharing with unique URLs
- [x] Schema search/filter
- [ ] Custom voice personalities (adjust host tone/focus)
- [ ] Multi-episode playlists (full database documentation series)
- [ ] Scheduled regeneration as catalog changes
- [ ] Analytics (track which schemas get listened to)
- [ ] Embeddable player widget

## License

MIT
