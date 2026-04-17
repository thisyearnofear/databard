# DataBard 🎙️

Generative podcast-style audio documentation for your data catalog.

Point DataBard at any OpenMetadata instance and it generates a two-host podcast episode that walks through your schemas, tables, data quality scores, and lineage — with AI voices debating tradeoffs and flagging issues.

## Features

- **Two-voice AI podcast** — Two distinct ElevenLabs voices discuss your data catalog like co-hosts
- **OpenMetadata integration** — Fetches real metadata via MCP server (tables, columns, lineage, quality, tags)
- **Visual episode cards** — Waveform animations and episode artwork as audio plays
- **Sound design** — ElevenLabs-generated intro jingles, transitions, and alert stings for quality issues
- **One-click generation** — Pick a schema, hit generate, listen

## Tech Stack

- **Next.js** — Web UI with episode cards, waveform visualization, catalog browser
- **OpenMetadata MCP** — Metadata fetching via MCP server
- **ElevenLabs** — Text-to-Speech (two voices), Sound Effects, Music Generation
- **Kiro** — Spec-driven development (see `.kiro/` directory)

## Getting Started

### Prerequisites

- Node.js 18+
- Docker Desktop (for OpenMetadata)
- ElevenLabs API key

### Setup

```bash
# Install dependencies
npm install

# Copy env template
cp .env.example .env
# Add your ELEVENLABS_API_KEY and OpenMetadata config

# Start OpenMetadata (if running locally)
curl -sL -o docker-compose-postgres.yml https://github.com/open-metadata/OpenMetadata/releases/download/1.10.4-release/docker-compose-postgres.yml
docker compose -f docker-compose-postgres.yml up --detach

# Run the app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How Kiro Was Used

See the `.kiro/` directory for specs, hooks, and steering docs that guided development.

## Roadmap

- [ ] Multi-episode playlists (full database documentation series)
- [ ] Custom voice cloning for branded data docs
- [ ] Onchain minting of audio docs as versioned NFTs
- [ ] Scheduled regeneration as catalog changes
- [ ] Shareable episode links

## License

MIT
