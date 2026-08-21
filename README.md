# DataBard

**AI data analyst that monitors your estate, synthesises what it finds, and acts on it.**

Data teams produce findings nobody reads. Execs don't open Looker. The data engineer's Slack message about a stale payments table gets buried. The insight exists — it just doesn't land.

DataBard closes that gap: it reads your data catalogue, computes health scores, narrates trend stories via two AI hosts, and writes the findings back into the graph.

> **[▶ Try the live demo](https://databard.persidian.com)** — no signup required

> **Built for the [DataHub Agent Hackathon](https://datahub.devpost.com/)** — reads DataHub's context graph, synthesises the estate, and writes back governance docs + ownership tags. *"DataHub gives the agent context; DataBard makes the agent act."*

---

## Quick start

```bash
git clone https://github.com/thisyearnofear/databard.git
cd databard
npm install
cp .env.example .env
# Required: ELEVENLABS_API_KEY (Starter plan or higher)
# Optional: OPENAI_API_KEY for LLM scripts (falls back to templates)
npm run dev
```

Open [localhost:3000](http://localhost:3000) → default workspace is **Protocols** (switch to Teams anytime) → Try the demo (lands on this week's [league](https://databard.persidian.com/league)) or connect a source → Dashboard / briefing → Share a score card.

**Connect DataHub:** pick 🧭 DataHub in the wizard (Teams), paste a GMS URL, connect. Run the fleet town hall at [/fleet](http://localhost:3000/fleet). Every capability is also agent-callable via the MCP tools (`GET /api/mcp/tools`).

**Public league:** [/league](https://databard.persidian.com/league) — weekly ranked protocol data-health accounting (OG card + copy tweet/email). When a live scan isn't available, numbers match the seeded demo roster — don't pitch them as a live indexer audit.

See [`.env.example`](.env.example) for the full list of optional env vars (Stripe, SMTP, Plausible, Solana, etc.).

---

## How it works

```
Data source (DataHub, OpenMetadata, dbt, The Graph, Dune)
  → Schema analysis: health score · critical tables · lineage blast radius
  → Script generation: two-host narrative (Alex + Morgan via ElevenLabs)
  → Dashboard: health score · trend narrative · recommended actions
  → Audio briefing: 2-min executive or 15-min full analysis
  → Write-back (DataHub): governance docs · ownership tags · health/defect tags
  → Optional: Monday email from the finding · schedule weekly (Pro) · alert on drops · attest on-chain (Solana) · share a score card (21-day link)
```

---

## Data sources

| Source | Adapter | Status |
|---|---|---|
| DataHub | `src/lib/datahub-adapter.ts` | ✅ Shipped |
| OpenMetadata | `src/lib/openmetadata.ts` | ✅ Shipped |
| dbt Cloud + local manifest | `src/lib/dbt-adapter.ts` | ✅ Shipped |
| The Graph | `src/lib/the-graph-adapter.ts` | ✅ Shipped |
| Dune Analytics | `src/lib/dune-adapter.ts` | ✅ Shipped |
| Coral (50+ sources via SQL) | `src/lib/coral-adapter.ts` | ✅ Shipped (escape hatch for long-tail sources) |

See [`docs/DATA_SOURCES_ARCHITECTURE.md`](docs/DATA_SOURCES_ARCHITECTURE.md) for the tiered adapter design and graduation tracking.

---

## Tech stack

| Layer | Technology |
|---|---|
| Web UI | Next.js 16, React 19, Tailwind CSS 4 |
| AI scripts | OpenAI-compatible API (GPT-4o-mini default; Azure drop-in via [`docs/AZURE.md`](docs/AZURE.md)) |
| Audio | ElevenLabs TTS (two voices) + Sound Effects API |
| Episode storage | Lens Protocol Grove (IPFS, immutable) via `src/lib/grove-storage.ts` |
| Caching | File-backed with TTL — no external dependencies |
| Payments | Stripe Checkout (Pro subscription) · x402 EIP-3009 USDT0 on X Layer (MCP pay-per-call) |
| Onchain | Solana Memo Program + PDA registry (Protocols workspace) |
| Analytics | Plausible (pageviews) + self-hosted event ledger (`src/lib/events.ts`) |

---

## OKX.AI — agent-to-agent marketplace

DataBard is registered as an [Agent Service Provider](https://www.okx.ai) (ASP) on OKX.AI (ASP #9878, pending final review). The synthesis engine is exposed as two A2MCP tools any MCP-compatible agent can call:

| Tool | Price | Endpoint |
|---|---|---|
| `databard_health_check` | Free | `POST /api/mcp/health-check` |
| `databard_briefing` | 1 USDT / call (x402) | `POST /api/mcp/briefing` |
| `databard_write_back` | Free | `POST /api/mcp/writeback` |
| Service discovery | — | `GET /api/mcp/tools` |

```bash
# Free health check
curl -X POST https://databard.persidian.com/api/mcp/health-check \
  -H 'content-type: application/json' \
  -d '{"source":"datahub","schemaFqn":"db.sales","datahub":{"serverUrl":"http://localhost:8080"}}'

# Paid briefing — returns 402 + PAYMENT-REQUIRED; agents settle via x402
curl -i -X POST https://databard.persidian.com/api/mcp/briefing \
  -H 'content-type: application/json' \
  -d '{"source":"openmetadata","schemaFqn":"db.sales","openmetadata":{"url":"...","token":"..."}}'
```

---

## DataHub integration

DataBard reads DataHub's full context graph (datasets, lineage, ownership, tags, assertions, freshness) and writes back:
- Governance-grade auto-documentation on dataset descriptions
- `DataBard_Health_*` tags (health band, ownerless, stale, undocumented)
- Suggested ownership on ownerless tables

See [`docs/DATAHUB_HACKATHON.md`](docs/DATAHUB_HACKATHON.md) for the full submission packet and demo script.

---

## Pro subscription

$49/month per team via Stripe:
- Scheduled weekly digests (email via SMTP or webhook)
- Multiple schemas
- Custom alert thresholds
- On-chain attestation (Solana mainnet, Protocols workspace)
- Team email recipients

Free: demo, ad-hoc briefings, shared score cards, `/league`, leaderboard, health badge, verify. Monday email capture on the finding starts the habit before Pro.

---

## Docs

| Doc | What it covers |
|---|---|
| [`docs/STRATEGY.md`](docs/STRATEGY.md) | North star, competitive positioning, product principles, why now |
| [`docs/PLAN.md`](docs/PLAN.md) | Full development roadmap (Phases 1–9) |
| [`docs/GTM.md`](docs/GTM.md) | Viral hooks, engagement loops, user interview plan, outreach target list |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Prod env, deploy, schedule cron, shared-PM2 stay-alive |
| [`docs/UNIT_ECONOMICS.md`](docs/UNIT_ECONOMICS.md) | Cost-per-briefing, pricing, margin analysis |
| [`docs/DATA_SOURCES_ARCHITECTURE.md`](docs/DATA_SOURCES_ARCHITECTURE.md) | Tiered adapter design, Coral graduation tracking |
| [`docs/DATAHUB_HACKATHON.md`](docs/DATAHUB_HACKATHON.md) | DataHub hackathon submission packet, demo script, judging-criteria map |
| [`docs/AZURE.md`](docs/AZURE.md) | Azure OpenAI + Container Apps migration guide |

---

## Build commands

```bash
npm run dev                                        # dev server on localhost:3000
DATABARD_DATA_DIR=/tmp/databard npm run build      # production build + bundle guard (<120MB)
./scripts/deploy.sh                                # local build → snel-bot (no npm on the box)
npx tsc --noEmit                                   # type check
npm run test:unit                                  # unit tests
npm run test:e2e                                   # Playwright E2E (chromium + Mobile Safari)
```

---

## License

[Apache License 2.0](LICENSE) — © 2026 DataBard Contributors.
