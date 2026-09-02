# AGENTS.md — DataBard

## Project Overview
DataBard is an AI data analyst that monitors your data estate, synthesises what it finds, and acts on it. The agent layer — synthesis, trend narratives, recommended next steps — is the product. Audio briefings, dashboards, alerts, and (next) automated actions are all output formats of that synthesis engine.

## Build & Dev Commands
- `npm run dev` — start dev server on localhost:3000
- `npm run build` — production build (81 static pages) + bundle size guard. Requires `DATABARD_DATA_DIR` set (the `data-dir.ts` guard throws in production mode without it); locally use `DATABARD_DATA_DIR=/tmp/databard-build-data npm run build`
- `npx tsc --noEmit` — type check only
- `npm run test:e2e` — Playwright E2E tests (chromium + Mobile Safari)
- `npm run test:unit` — rate-limit, datahub-adapter, fleet-analysis, account, score-card (`package.json`)
- `./scripts/deploy.sh` — local build → tarball → `snel-bot` (`/opt/databard`), PM2 reload, health gate, installs `ensure-running` cron. Do **not** `npm install` on the box.
- `npx playwright install` — install required browsers
- `npx playwright test --project=chromium` — run a single browser project

## Bundle Size Guard
The build runs `scripts/check-bundle-size.mjs` after `prepare-standalone.mjs`.
It fails the build if `.next/standalone/` exceeds 120MB or if `contracts/` or
`video/` directories appear in the standalone output. Current healthy size:
~85MB (was ~73MB before the OKX x402 server SDK + viem were traced into the
server bundle for the A2MCP paid endpoint — see "OKX.AI A2MCP ASP" below).
Warn threshold 90MB. If the guard fails, check `outputFileTracingExcludes` in
`next.config.mjs` and the binary asset filter in `prepare-standalone.mjs`.

## Production Environment
`DATABARD_DATA_DIR` is **required** in production (set in `ecosystem.config.cjs`).
Without it, `data-dir.ts` and `store.ts` throw at startup. This prevents
`process.cwd()` from leaking into the server bundle via Next.js file tracing,
which would trace the entire project directory (including Rust build artifacts).

Live site: `https://databard.persidian.com` (PM2 `databard` on port 42100). Shared
host PM2 with other apps — see `docs/OPERATIONS.md` stay-alive section.
`scripts/ensure-running.sh` runs every 2 minutes and `startOrReload`s this
ecosystem if `/api/insights` is not 200, then `pm2 save`s so we stay in the dump.

## Analytics
Two-layer analytics system:

1. **Pageviews** — Plausible (optional). Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` env var to enable. Without it, no pageview tracking.
2. **Custom events** — self-hosted event ledger at `src/lib/events.ts`. Client-side `track()` function in `src/lib/track.ts` fires events via POST `/api/events`. Events stored in `data/events.json` (rolling 10k window). View stats via GET `/api/events`.

### Tracked funnel events
- `landing_cta_click` — which CTA (demo vs connect) on landing page
- `demo_play` — demo episode actually played (not just clicked)
- `persona_toggle` — Teams vs Protocols workspace switch
- `connect_start` — user clicked connect
- `generate_complete` — analysis finished, landed on dashboard
- `dashboard_listen_click` — clicked "Listen to this analysis" on dashboard
- `schedule_setup` — clicked "Set up weekly digest" (Pro path)
- `monday_signup` — email on the finding: send this every Monday (pre-Pro habit)
- `clip_share` — clicked "Share card" (score card + deep link)
- `shared_episode_open` — someone opened a shared episode / score-card link
- `shared_episode_cta_click` — CTA on shared page (league / get this / dashboard)
- `league_page_view` — visited `/league` (weekly protocol accounting magnet)
- `league_share_copy` — copied tweet, email, or permalink from the league
- `roast_page_view` — visited /roast
- `roast_cta_click` — clicked "Roast my data" on /roast

### Adding new events
1. Add the event type to `EVENT_TYPES` in `src/lib/events.ts`
2. Call `track("event_name", { meta_key: "value" })` at the right point in the UI
3. Meta values must be strings, max 5 keys, max 120 chars each

## Email Delivery
Scheduled digest emails use `src/lib/notifications.ts`. Two methods:
- `SMTP_URL` env var + `npm install nodemailer` — direct SMTP
- `EMAIL_WEBHOOK_URL` env var — POST to a webhook (Slack, Zapier, custom service)
- Neither set — dev mode (logs and skips)

## Key Files
- `src/lib/events.ts` — event ledger (whitelist, storage, stats)
- `src/lib/track.ts` — client-side track() function
- `src/lib/notifications.ts` — email delivery for scheduled digests
- `src/lib/script-generator.ts` — LLM script generation (Alex + Morgan)
- `src/lib/schema-analysis.ts` — health score, critical tables, trend diffs
- `src/lib/x402.ts` — OKX x402 payment server setup (facilitator + resource server + briefing route config)
- `src/lib/mcp.ts` — shared A2MCP input parser (one-shot connection config from request body)
- `src/app/api/mcp/health-check/route.ts` — FREE A2MCP tool: schema health score + recommended actions
- `src/app/api/mcp/briefing/route.ts` — PAID A2MCP tool (x402): full synthesis (script + audio + health)
- `src/app/api/mcp/tools/route.ts` — A2MCP service discovery (tool list + JSON schemas)
- `src/lib/datahub-adapter.ts` — DataHub GMS adapter: GraphQL read (datasets, lineage, owners, tags, assertions, profile) + write-back (tags + AI descriptions)
- `src/app/api/mcp/writeback/route.ts` — FREE A2MCP tool: writes findings back into the DataHub context graph
- `src/app/protocol/page.tsx` — dashboard (hero output)
- `src/app/league/page.tsx` — public weekly protocol data-health league
- `src/lib/league.ts` — league edition builder (live snapshots or seeded roster)
- `src/lib/score-card.ts` — shareable finding (score + quote); prefers the episode's frozen `healthScore`, falls back to the test pass ratio; shared TTL = 21 days
- `src/components/EpisodePlayer.tsx` — audio player with drill-down + Share card
- `src/components/MondaySignup.tsx` — one-field Monday email on the finding
- `src/components/wizard/wizard-context.tsx` — wizard provider (slim, wires together types + reducer + effects)
- `src/components/wizard/wizard-types.ts` — wizard state shape, action types, initialState
- `src/components/wizard/wizard-reducer.ts` — composed reducer (5 domain reducers: core, connection, schema, generation, episode)
- `src/components/wizard/wizard-effects.ts` — extracted effect hooks (persona sync, connection persistence, mint stats, schema defaults, deep links)
- `src/components/wizard/LandingStep.tsx` — landing page (default workspace: Protocols)
- `src/app/roast/page.tsx` — "Roast my data" landing variant
- `src/lib/product/score-tone.ts` — the one score→colour mapping (80/50 thresholds) for text classes, tints and server-side image hexes
- `src/components/dither-kit/icon.tsx` — `PixelIcon` glyph set (8×8 bitmaps rendered as crisp-edged SVG); use these instead of emoji on shell, landing, dashboard, player, league and onchain surfaces
- `scripts/ensure-running.sh` — prod stay-alive watchdog (cron every 2 min)

## Theming
Dark-first. An inline pre-hydration script in `layout.tsx` reads `localStorage["databard:theme"]` and sets `data-theme` on `<html>` before first paint, so light mode never flashes dark; `data-theme="dark"` stays the no-JS default. Light mode is opt-in via the `ThemeToggle` component (persisted to `localStorage["databard:theme"]`). All colors use CSS variables (`var(--bg)`, `var(--surface)`, `var(--text)`, etc.) defined in `globals.css` — no hardcoded Tailwind color classes in components. Type: headings (`h1,h2,h3`) and score numerals use the self-hosted Space Grotesk face via `--font-display` / `.font-display`; body copy stays system-ui.

## Docs
- `docs/STRATEGY.md` — north star, competitive positioning, product principles, operating principles (PG framework)
- `docs/GTM.md` — viral hooks, engagement loops, user interview plan, manual outreach target list
- `docs/OPERATIONS.md` — prod env, schedule cron, stay-alive / shared PM2
- `docs/UNIT_ECONOMICS.md` — cost-per-briefing, pricing, margin analysis
- `docs/PLAN.md` — development roadmap (Phases 1-9)
- `docs/DATA_SOURCES_ARCHITECTURE.md` — tiered source architecture
- `docs/DATAHUB_HACKATHON.md` — DataHub Agent Hackathon submission packet (pitch, judging-criteria map, setup, demo shot list)
- `docs/AZURE.md` — Azure OpenAI migration guide

## OKX.AI A2MCP ASP
DataBard is registered as an Agent Service Provider (ASP) on OKX.AI, exposing the synthesis engine as two A2MCP (Agent-to-MCP) pay-per-call / free tools. The endpoints are stateless one-shot wrappers over the same libs the wizard/synthesize pipeline uses — no session dependency.

### Endpoints (live at `https://databard.persidian.com`)
- `POST /api/mcp/health-check` — **FREE**. `databard_health_check`: health score, critical tables, stale/ownerless/undocumented counts, prioritised recommended actions. No LLM, no audio. The discovery driver.
- `POST /api/mcp/briefing` — **PAID (x402)**. `databard_briefing`: full synthesis — script (Alex + Morgan) + audio (MP3, base64 + Grove URL) + health + recommended actions. The hero tool.
- `GET /api/mcp/tools` — service discovery: tool list + JSON input/output schemas.
- `POST /api/mcp/writeback` — **FREE** (additional tool, not a registered OKX service). `databard_write_back`: analyses a DataHub schema and writes findings back into the DataHub graph — health + defect tags and an idempotent AI summary description. Requires `source: "datahub"`.

### Pricing
- Health check: free (`fee: "0"`).
- Briefing: `exact` EIP-3009 USDT0 transfer on X Layer (`eip155:196`), default `$1.00`/call (set `BRIEFING_PRICE_USD`). Cost-per-briefing is ~$0.80, so ~$0.20 margin per call. Settlement only happens after the handler returns <400, so failed synthesis never charges the caller.

### x402 server setup (`src/lib/x402.ts`)
Uses the OKX Payment SDK (`@okxweb3/x402-core` + `@okxweb3/x402-evm` + `@okxweb3/x402-next`). The paid route is wrapped with `withX402(handler, briefingRouteConfig, x402Server)` — the SDK handles the 402 challenge (base64 `PAYMENT-REQUIRED` header), signature verification, and on-chain settlement via the OKX facilitator (`syncSettle: true` waits for confirmation).

### Required production env (for the paid endpoint to go live)
- `PAY_TO_ADDRESS` — X Layer EVM address that receives funds (your Agentic Wallet address)
- `OKX_API_KEY` / `OKX_SECRET_KEY` / `OKX_PASSPHRASE` — from the [OKX Developer Portal](https://web3.okx.com/zh-hans/onchainos/dev-portal)
- `BRIEFING_PRICE_USD` — per-call price as a money string (default `$1.00`). **Do NOT prefix with `$` in `.env`** — Next.js's env loader expands `$VAR` references, so `$1.00` becomes `.00`. Use `1.00` (no `$`); the SDK's `parseMoneyToDecimal` handles both formats.

Without these, `/api/mcp/briefing` returns **503** (not a 402) so a misconfigured deploy fails loudly rather than registering a broken ASP. The free health-check and tools endpoints need no extra env.

### Self-check before listing (must pass before OKX review)
```
curl -i https://databard.persidian.com/api/mcp/tools                          # expect HTTP 200
curl -i -X POST https://databard.persidian.com/api/mcp/health-check \
  -H 'content-type: application/json' \
  -d '{"source":"openmetadata","schemaFqn":"db.sales","openmetadata":{"url":"...","token":"..."}}'   # expect HTTP 200
curl -i -X POST https://databard.persidian.com/api/mcp/briefing \
  -H 'content-type: application/json' \
  -d '{"source":"openmetadata","schemaFqn":"db.sales","openmetadata":{"url":"...","token":"..."}}'   # expect HTTP 402 + PAYMENT-REQUIRED header
curl -i -X POST https://databard.persidian.com/api/mcp/health-check \
  -H 'content-type: application/json' \
  -d '{"source":"datahub","schemaFqn":"db.sales","datahub":{"serverUrl":"http://localhost:8080"}}'   # expect HTTP 200 (DataHub source)
curl -i -X POST https://databard.persidian.com/api/mcp/writeback \
  -H 'content-type: application/json' \
  -d '{"source":"datahub","schemaFqn":"db.sales","datahub":{"serverUrl":"http://localhost:8080"}}'   # expect HTTP 200 (write back to DataHub graph)
```

### Registration status (DONE — pending final OKX review)
- **ASP identity #9878** — `DataBard`, registered on X Layer (chainIndex 196).
  - Owner address: `0x5e32740122999bb98a50055d68593f94d2a0711e` (Agentic Wallet, `papaandthejimjams@gmail.com`).
  - Create tx: `0xcb9d3fd178b0b90ee1a9553f4431359d2906afad50c68deafc261e5c65d4019d`
  - Communication address: `0xb317D8c5f526dE3d987e5C28DCbbC793ec22a9f6` (A2A runtime, refreshed via `okx-a2a doctor --fix`).
  - Avatar: `https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/19bd9c79-c096-4795-8e6e-19c58fd4e1e2.jpg`
  - Approval status: `3` (AI quality review suggested pass) → submitted via `agent activate --agent-id 9878 --preferred-language en-US`. Check with `onchainos agent get-agents --agent-ids 9878` — flips to "listed" when OKX finalises.
- **Services attached** (verified via `onchainos agent service-list --agent-id 9878`):
  1. `Data Health Check` — serviceId `2b2e60d3-fa9b-4433-8bc0-d79c0d60624f`, id `37750`, A2MCP, fee `0`, endpoint `https://databard.persidian.com/api/mcp/health-check`.
  2. `Data Briefing` — serviceId `5aeed929-71a2-4293-b8b1-e2485fed94a4`, id `37751`, A2MCP, fee `1` USDT, endpoint `https://databard.persidian.com/api/mcp/briefing`.
- **Builder Code NFT** — `iea0zhsx4mp4an14`, minted to `0x55a5705453ee82c742274154136fce8149597058` (Builder Codes contract `0xd6c426f9c077358735622ae5a83468dc0510823b` on X Layer). This is the OKX builder-program credential, NOT the ASP identity. Mint tx: `0x7cde4769a44cd4c18a8da356ef33522e593c269990ce46e2d1885757cc6155f1`. The Builder Code payout address is also used as `PAY_TO_ADDRESS` for x402 settlement.
- **Other ASPs under the same wallet** (one address = one identity per role, but multiple ASPs are allowed): `OnPoint` #9874, `Wowowify` #6462.

### Deploy state
- Production tracks `main` via `./scripts/deploy.sh` (local Next standalone build → scp tarball → PM2 `startOrReload` → `/api/insights` health gate → ensure-running cron). Pushing git alone does not ship.
- x402 env vars live in `/opt/databard/.env` on the production host (symlinked into each release by `deploy.sh`). NOT in `ecosystem.config.cjs` — the PM2 env block is for non-secret runtime config only.
- Local `.env` is gitignored; the deploy script never ships it. Never `npm install` on `snel-bot` for this app.

### Remaining steps (user actions)
1. Wait for OKX final approval (status flips to "listed" — check with `onchainos agent get-agents --agent-ids 9878`).
2. Record a 90s X demo post with `#OKXAI` — see `docs/OKX_AI_ASP.md` for the shot list.
3. Submit the [OKX.AI Genesis Hackathon Google form](https://forms.gle/mddEUagmDbyV37ws8) (deadline was Jul 28 23:59 UTC; may be extended — verify before submitting).

### How to re-register / update (reference, not re-run)
1. Install Onchain OS skills: `npx skills add okx/onchainos-skills --yes -g`
2. Log in to Agentic Wallet (`onchainos wallet status` — provides the owner address; `PAY_TO_ADDRESS` for x402 can be any address you control, including the Builder Code payout address).
3. Register as A2MCP ASP (`agent create --role asp`) with the two services above — each service needs `serviceName` (5–30 chars), `serviceDescription` (3-part for non-subscription: capability / what user provides / delivery note, each on its own `1.`/`2.`/`3.` line), `serviceType: "A2MCP"`, `fee` (plain number string, USDT implicit), and `endpoint` (the full `https://databard.persidian.com/api/mcp/...` URL — permanent on-chain).
4. `validate-listing` runs QA once on the full set (must pass before `create`).
5. `agent activate --agent-id <id> --preferred-language en-US` to submit for review; OKX finalises within ~24h.
6. After create, run `okx-a2a doctor --fix --json` to refresh the A2A communication runtime (the new identity needs to be added to the daemon's active clients).

### Notes
- The 402 challenge goes in the **`PAYMENT-REQUIRED` response header** (base64), not the body — the marketplace validates the header.
- Identities live on XLayer only (`eip155:196`); never pass `--chain` to identity commands.
- The recurring-digest half of DataBard (scheduled digests, persisted connections, alerts) does NOT fit A2MCP — only the one-shot synthesis is exposed as the ASP.
- fal.ai key for avatar generation is stored in the macOS keychain (service `fal.ai`, account `$USER`); retrieve with `security find-generic-password -s "fal.ai" -w` (may prompt via GUI on macOS).
