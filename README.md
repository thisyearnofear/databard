# DataBard 🎙️

**Nobody reads data docs. So we made them a podcast.**

Generative podcast-style audio documentation for your data catalog. Point DataBard at any OpenMetadata instance and it generates a two-host podcast episode that walks through your schemas, tables, data quality scores, and lineage — with AI voices debating tradeoffs and flagging issues.

## Features

- 🎙️ **Two-voice AI podcast** — Alex (enthusiastic data advocate) and Morgan (skeptical quality auditor) discuss your data catalog
- 🔌 **OpenMetadata integration** — Fetches tables, columns, lineage, quality tests, and tags via REST API
- 🎨 **Interactive episode player** — Real-time waveform visualization with Web Audio API
- 🎵 **Sound design** — ElevenLabs-generated intro/outro jingles, transition sounds, quality alert stings
- ⚡ **One-click generation** — Connect → select schema → generate → listen

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Audio**: ElevenLabs SDK (TTS + sound effects), Web Audio API
- **Data**: OpenMetadata REST API
- **Styling**: Tailwind CSS 4, dark theme
- **Development**: Kiro (spec-driven workflow)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- ElevenLabs API key ([get one here](https://elevenlabs.io))
- OpenMetadata instance (local or use [sandbox.open-metadata.org](https://sandbox.open-metadata.org))

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/databard.git
cd databard

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your ELEVENLABS_API_KEY
```

### Running Locally

```bash
# Start the dev server
npm run dev

# Open http://localhost:3000
```

### Usage

1. **Connect**: Enter your OpenMetadata URL and auth token
2. **Select**: Choose a schema from the list
3. **Generate**: Click to generate the podcast (takes 30-60s depending on schema size)
4. **Listen**: Hit play and enjoy your data catalog as a podcast!

## How It Works

```
OpenMetadata API → Metadata Fetcher → Script Generator → Audio Engine → MP3
                    (tables, quality,   (two-host       (ElevenLabs
                     lineage, tags)      conversation)    TTS + SFX)
```

1. **Metadata Fetcher** (`lib/openmetadata.ts`): Fetches tables, columns, quality test results, lineage edges, and tags
2. **Script Generator** (`lib/script-generator.ts`): Converts metadata into a natural two-host conversation
3. **Audio Engine** (`lib/audio-engine.ts`): Synthesizes speech with ElevenLabs TTS (two voices), adds sound effects, concatenates into MP3

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── connect/route.ts          # List schemas
│   │   ├── metadata/route.ts         # Fetch schema metadata
│   │   ├── generate-script/route.ts  # Generate podcast script
│   │   └── synthesize/route.ts       # Full pipeline → MP3
│   ├── page.tsx                      # Main UI
│   └── globals.css                   # Dark theme styles
├── components/
│   └── EpisodePlayer.tsx             # Audio player with waveform
└── lib/
    ├── types.ts                      # Shared TypeScript types
    ├── openmetadata.ts               # OpenMetadata API client
    ├── script-generator.ts           # Script generation logic
    └── audio-engine.ts               # ElevenLabs integration
```

## Development with Kiro

This project was built using Kiro's spec-driven development workflow:

- **Specs** (`.kiro/specs/`): Defined API contracts and module interfaces before coding
- **Steering** (`.kiro/steering/`): Project conventions and ElevenLabs patterns
- **Hooks** (`.kiro/hooks/`): Auto-validation of API routes on save

See [KIRO.md](./KIRO.md) for detailed development notes and concrete examples.

## Hackathons

Built for:
- **ElevenHacks Kiro** (deadline: Apr 23, 2026) — showcasing Kiro's spec + steering + hooks workflow
- **WeMakeDevs × OpenMetadata** (deadline: Apr 26, 2026) — deep OpenMetadata API integration

## Roadmap

- [ ] Multi-episode playlists (full database documentation series)
- [ ] Custom voice cloning for branded data docs
- [ ] Catalog browser UI (tree view of databases → schemas → tables)
- [ ] Scheduled regeneration as catalog changes
- [ ] Shareable episode links with embedded player

## License

MIT — see [LICENSE](./LICENSE)
