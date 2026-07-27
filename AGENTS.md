# AGENTS.md — DataBard

## Project Overview
DataBard is an AI data analyst that monitors your data estate, synthesises what it finds, and acts on it. The agent layer — synthesis, trend narratives, recommended next steps — is the product. Audio briefings, dashboards, alerts, and (next) automated actions are all output formats of that synthesis engine.

## Build & Dev Commands
- `npm run dev` — start dev server on localhost:3000
- `npm run build` — production build (81 static pages) + bundle size guard. Requires `DATABARD_DATA_DIR` set (the `data-dir.ts` guard throws in production mode without it); locally use `DATABARD_DATA_DIR=/tmp/databard-build-data npm run build`
- `npx tsc --noEmit` — type check only
- `npm run test:e2e` — Playwright E2E tests (chromium + Mobile Safari)
- `npm run test:unit` — `tsx tests/rate-limit.unit.ts`
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

## Analytics
Two-layer analytics system:

1. **Pageviews** — Plausible (optional). Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` env var to enable. Without it, no pageview tracking.
2. **Custom events** — self-hosted event ledger at `src/lib/events.ts`. Client-side `track()` function in `src/lib/track.ts` fires events via POST `/api/events`. Events stored in `data/events.json` (rolling 10k window). View stats via GET `/api/events`.

### Tracked funnel events
- `landing_cta_click` — which CTA (demo vs connect) on landing page
- `demo_play` — demo episode actually played (not just clicked)
- `persona_toggle` — enterprise vs onchain switch
- `connect_start` — user clicked connect
- `generate_complete` — analysis finished, landed on dashboard
- `dashboard_listen_click` — clicked "Listen to this analysis" on dashboard
- `schedule_setup` — clicked "Set up weekly digest"
- `clip_share` — clicked "Share moment" (viral hook)
- `shared_episode_open` — someone opened a shared episode link
- `shared_episode_cta_click` — clicked "Get this for your data" on shared page
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
- `src/app/protocol/page.tsx` — dashboard (hero output)
- `src/components/EpisodePlayer.tsx` — audio player with drill-down
- `src/components/wizard/wizard-context.tsx` — wizard provider (slim, wires together types + reducer + effects)
- `src/components/wizard/wizard-types.ts` — wizard state shape, action types, initialState
- `src/components/wizard/wizard-reducer.ts` — composed reducer (5 domain reducers: core, connection, schema, generation, episode)
- `src/components/wizard/wizard-effects.ts` — extracted effect hooks (persona sync, connection persistence, mint stats, schema defaults, deep links)
- `src/components/wizard/LandingStep.tsx` — landing page
- `src/app/roast/page.tsx` — "Roast my data" landing variant

## Theming
Dark-first. `data-theme="dark"` is set on `<html>` in `layout.tsx`. Light mode is opt-in via the `ThemeToggle` component (dark/light toggle, persisted to `localStorage["databard:theme"]`). All colors use CSS variables (`var(--bg)`, `var(--surface)`, `var(--text)`, etc.) defined in `globals.css` — no hardcoded Tailwind color classes in components.

## Docs
- `docs/STRATEGY.md` — north star, competitive positioning, product principles, operating principles (PG framework)
- `docs/GTM.md` — viral hooks, engagement loops, user interview plan, manual outreach target list
- `docs/UNIT_ECONOMICS.md` — cost-per-briefing, pricing, margin analysis
- `docs/PLAN.md` — development roadmap (Phases 1-7)
- `docs/DATA_SOURCES_ARCHITECTURE.md` — tiered source architecture
- `docs/AZURE.md` — Azure OpenAI migration guide

## OKX.AI A2MCP ASP
DataBard is registered as an Agent Service Provider (ASP) on OKX.AI, exposing the synthesis engine as two A2MCP (Agent-to-MCP) pay-per-call / free tools. The endpoints are stateless one-shot wrappers over the same libs the wizard/synthesize pipeline uses — no session dependency.

### Endpoints (live at `https://databard.persidian.com`)
- `POST /api/mcp/health-check` — **FREE**. `databard_health_check`: health score, critical tables, stale/ownerless/undocumented counts, prioritised recommended actions. No LLM, no audio. The discovery driver.
- `POST /api/mcp/briefing` — **PAID (x402)**. `databard_briefing`: full synthesis — script (Alex + Morgan) + audio (MP3, base64 + Grove URL) + health + recommended actions. The hero tool.
- `GET /api/mcp/tools` — service discovery: tool list + JSON input/output schemas.

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
```

### Registration path (OKX.AI)
1. Install Onchain OS skills: `npx skills add okx/onchainos-skills --yes -g`
2. Log in to Agentic Wallet (provides the `PAY_TO_ADDRESS`)
3. Register as A2MCP ASP (`agent create --role asp`) with the two services above — each service needs `serviceName` (5–30 chars), `serviceDescription` (2-part: capability + what user provides), `serviceType: "A2MCP"`, `fee` (plain number string, USDT implicit), and `endpoint` (the full `https://databard.persidian.com/api/mcp/...` URL — permanent on-chain)
4. `agent activate #<id>` to list; OKX reviews within 24h

### Notes
- The 402 challenge goes in the **`PAYMENT-REQUIRED` response header** (base64), not the body — the marketplace validates the header.
- Identities live on XLayer only (`eip155:196`); never pass `--chain` to identity commands.
- The recurring-digest half of DataBard (scheduled digests, persisted connections, alerts) does NOT fit A2MCP — only the one-shot synthesis is exposed as the ASP.
