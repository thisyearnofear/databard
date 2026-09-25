# AGENTS.md — DataBard

## Project Overview
DataBard is an AI data analyst that monitors your data estate, synthesises what it finds, and acts on it. The agent layer — synthesis, trend narratives, recommended next steps — is the product. Audio briefings, dashboards, alerts, and (next) automated actions are all output formats of that synthesis engine.

## Build & Dev Commands
- `npm run dev` — start dev server on localhost:3000
- `npm run build` — production build (81 static pages) + bundle size guard. Requires `DATABARD_DATA_DIR` set (the `data-dir.ts` guard throws in production mode without it); locally use `DATABARD_DATA_DIR=/tmp/databard-build-data npm run build`
- `npx tsc --noEmit` — type check only
- `npm run test:e2e` — Playwright E2E tests (chromium + Mobile Safari)
- `npm run test:unit` — rate-limit, datahub-adapter, fleet-analysis, account, score-card, serial-queue, monid-adapter (`package.json`)
- `./scripts/deploy.sh` — local build → tarball → `snel-bot` (`/opt/databard`), PM2 reload, health gate, installs `ensure-running` cron. Do **not** `npm install` on the box.
- `npx playwright install` — install required browsers
- `npx playwright test --project=chromium` — run a single browser project

## Bundle Size Guard
The build runs `scripts/check-bundle-size.mjs` after `prepare-standalone.mjs`.
It fails the build if `.next/standalone/` exceeds 120MB or if `contracts/` or
`video/` directories appear in the standalone output. Current healthy size:
~69MB. It had drifted to ~107MB because libs reading via `path.join(process.cwd(), …)`
made the file tracer include the whole project root (demo-assets, screenshots-review,
test-results) in API route bundles — fixed by scoping `outputFileTracingExcludes` to
`"*"` in `next.config.mjs`. Keep `public/` traced: demo fixtures read episode MP3s from
it at runtime, and the binary filter in `prepare-standalone.mjs` strips them from its
own copy. Warn threshold 90MB. If the guard fails, check `outputFileTracingExcludes` in
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
- `probe_run` — Probe executed (meta: mode=preview for the free route, candidate count, top pick, attest flag)
- `agents_page_view` — visited `/agents` (agent-tool doorway)
- `agent_demo_run` — ran the free health-check example on /agents
- `earn_index_view` — visited `/earn` (sponsor report index)
- `shared_clip_play` — played the clip on a shared score-card page
- `marketplace_index_view` — visited `/probe/marketplace` (OKX.AI health index)
- `service_score_lookup` — `databard_service_score` tool called

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
- `src/lib/x402.ts` — OKX x402 payment server setup (facilitator + resource server + briefing & probe route configs)
- `src/lib/mcp.ts` — shared A2MCP input parser (one-shot connection config from request body)
- `src/lib/probe-runner.ts` — DataBard Probe: fetches & measures A2MCP endpoints, x402 client payment, returns ProbeMetrics
- `src/lib/probe-scorer.ts` — composite 6-dimension quality score (schema, latency, freshness, price/value, reliability, credentials)
- `src/lib/probe-attestation.ts` — writes verdict hash to X Layer via viem (zero-value self-send); signs with `PROBE_ATTESTATION_PK`, falling back to `PROBE_PAYER_PK`
- `src/app/api/agent/probe/route.ts` — PAID A2MCP tool (x402, $1): probes candidate services, returns ranked verdict + cost receipt + optional on-chain attestation
- `src/app/api/probe/preview/route.ts` — FREE preview of Probe (default candidates, outbound payments disabled, 10/hr rate limit) for browser demos
- `src/app/probe/page.tsx` — Probe demo UI (question input, free preview, paid-endpoint check with 402 explainer, ranked result cards, cost + attestation)
- `src/components/probe/ResultCard.tsx` — probe result card (score, 6-dimension breakdown, x402 paid/402-challenge/cached badges, flags)
- `src/app/api/mcp/health-check/route.ts` — FREE A2MCP tool: schema health score + recommended actions
- `src/app/api/mcp/briefing/route.ts` — PAID A2MCP tool (x402): marketplace briefing (whole-market cached, or scoped with live re-check) or legacy schema synthesis (script + audio + health)
- `src/app/api/mcp/tools/route.ts` — A2MCP service discovery (tool list + JSON schemas)
- `src/lib/datahub-adapter.ts` — DataHub GMS adapter: GraphQL read (datasets, lineage, owners, tags, assertions, profile) + write-back (tags + AI descriptions)
- `src/lib/monid-adapter.ts` — Monid metered-endpoint adapter: shells to the `monid` CLI (execFile), maps arbitrary run results → `SchemaMeta`, captures the measured per-run cost (`getMonidCost` sidecar)
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
- `scripts/probe-smoke.mjs` — paid x402 smoke test for `/api/agent/probe` (pays the challenge with `PROBE_PAYER_PK` from `.env`, prints the verdict)
- `src/lib/marketplace-index.ts` — OKX.AI marketplace health index: unpaid listing checks (x402 gate + price match, never pays), scoring, persistence, optional budgeted deep checks. Index checks verify the listing/payment gate only — NOT paid output quality; "gate not reached" is a neutral flag, not an accusation. Our own ASP #9878 rows are marked `ours` and excluded from aggregates. Also exports `recheckServicesLive` — the paid-briefing scoped path (live unpaid checks + budgeted paid re-verify for named services only, per-service timeout, cached fallback, shared spend ledger).
- `scripts/crawl-okx-marketplace.mjs` — rebuilds `src/lib/okx-marketplace.snapshot.json` via `onchainos agent search` + `service-list` for explicit agent ids (9878)
- `GET /api/probe/marketplace` — latest index; `POST /api/probe/marketplace/refresh` — cron-secret refresh (`attest`, `deepBudget`, `dryRun`); `GET /api/probe/badge/[serviceId]` — shields SVG; `POST /api/mcp/service-score` — free `databard_service_score` lookup tool; pages `/probe/marketplace` + `/probe/marketplace/[serviceId]`

## Theming
Dark-first. An inline pre-hydration script in `layout.tsx` reads `localStorage["databard:theme"]` and sets `data-theme` on `<html>` before first paint, so light mode never flashes dark; `data-theme="dark"` stays the no-JS default. Light mode is opt-in via the `ThemeToggle` component (persisted to `localStorage["databard:theme"]`). All colors use CSS variables (`var(--bg)`, `var(--surface)`, `var(--text)`, etc.) defined in `globals.css` — no hardcoded Tailwind color classes in components. Type: headings (`h1,h2,h3`) and score numerals use the self-hosted Space Grotesk face via `--font-display` / `.font-display`; body copy stays system-ui.

## Docs
- `docs/STRATEGY.md` — north star (public accounting: reports people share, tools agents call), positioning, principles (rewritten Sep 2026)
- `docs/GTM.md` — the two distribution loops (edition shares, agent discovery), hooks, manual outreach
- `docs/OPERATIONS.md` — prod env, schedule cron, stay-alive / shared PM2
- `docs/UNIT_ECONOMICS.md` — margins per revenue shape (editions, x402 briefing, probe, legacy Pro)
- `docs/PLAN.md` — roadmap (Phases 1-9 compressed history, 10-14 forward)
- `docs/DATA_SOURCES_ARCHITECTURE.md` — tiered source architecture (Tier 0 public datasets → Tier 2b Monid)
- `docs/DATAHUB_HACKATHON.md` — DataHub Agent Hackathon submission packet (pitch, judging-criteria map, setup, demo shot list)
- `docs/MONID_HACKATHON.md` — Monid "We Kill" hackathon packet (generic metered-endpoint kill, measured-cost receipt, deferred video/social checklist)
- `docs/CANDIDATE_TRACKER.md` — PARKED until after Monid: Campaign Lab candidate-website longitudinal tracker (separate vertical experiment, not the data-health roadmap)
- `docs/AZURE.md` — Azure OpenAI migration guide
- `docs/OKX_DEV_DAY_2026.md` — OKX Dev Day 2026 hackathon: DataBard Probe (agent-service quality oracle on X Layer)

## OKX.AI A2MCP ASP
DataBard is registered as an Agent Service Provider (ASP) on OKX.AI, exposing the synthesis engine as two A2MCP (Agent-to-MCP) pay-per-call / free tools. The endpoints are stateless one-shot wrappers over the same libs the wizard/synthesize pipeline uses — no session dependency.

### Endpoints (live at `https://databard.persidian.com`)
- `POST /api/mcp/health-check` — **FREE**. `databard_health_check`: health score, critical tables, stale/ownerless/undocumented counts, prioritised recommended actions. No LLM, no audio. The discovery driver.
- `POST /api/mcp/briefing` — **PAID (x402)**. `databard_briefing`: marketplace briefing by default (whole-market from the Probe index with `{}`, or scoped per-service verdicts via `agentIds`/`serviceIds`/`endpoints`/`query`); legacy schema-health briefing with `mode:"schema"`. Scoped briefings re-verify the named services live (`freshness: live|partial|cached`, opt out with `fresh:false`). Audio is opt-in (`audio:"url"|"inline"`, default `"none"` text-only). The hero tool.
- `GET /api/mcp/tools` — service discovery: tool list + JSON input/output schemas.
- `POST /api/mcp/writeback` — **FREE** (additional tool, not a registered OKX service). `databard_write_back`: analyses a DataHub schema and writes findings back into the DataHub graph — health + defect tags and an idempotent AI summary description. Requires `source: "datahub"`.

### Pricing
- Health check: free (`fee: "0"`).
- Briefing: `exact` EIP-3009 USDT0 transfer on X Layer (`eip155:196`), default `$1.00`/call (set `BRIEFING_PRICE_USD`). Text-only marketplace briefing costs ~nothing (no LLM/TTS); a scoped fresh briefing spends ≤$0.10 outbound paid-verification (own cap + shared $1/day ledger) — margin ~$0.90. Schema-mode with audio costs ~$0.30–0.35 (Flash TTS + bookends SFX via `BRIEFING_SFX_MODE`). Settlement only happens after the handler returns <400, so failed synthesis never charges the caller.

### x402 server setup (`src/lib/x402.ts`)
Uses the OKX Payment SDK (`@okxweb3/x402-core` + `@okxweb3/x402-evm` + `@okxweb3/x402-next`). The paid route is wrapped with `withX402(handler, briefingRouteConfig, x402Server)` — the SDK handles the 402 challenge (base64 `PAYMENT-REQUIRED` header), signature verification, and on-chain settlement via the OKX facilitator (`syncSettle: true` — the response waits for confirmation; async was tried Sep 25 and settled nothing, so verified payments moved $0).

### Required production env (for the paid endpoint to go live)
- `PAY_TO_ADDRESS` — X Layer EVM address that receives funds (your Agentic Wallet address)
- `OKX_API_KEY` / `OKX_SECRET_KEY` / `OKX_PASSPHRASE` — from the [OKX Developer Portal](https://web3.okx.com/zh-hans/onchainos/dev-portal)
- `BRIEFING_PRICE_USD` — per-call price as a money string (default `$1.00`). **Do NOT prefix with `$` in `.env`** — Next.js's env loader expands `$VAR` references, so `$1.00` becomes `.00`. Use `1.00` (no `$`); the SDK's `parseMoneyToDecimal` handles both formats.

Without these, `/api/mcp/briefing` returns **503** (not a 402) so a misconfigured deploy fails loudly rather than registering a broken ASP. The free health-check and tools endpoints need no extra env.

### Self-check before listing (must pass before OKX review)
```
curl -i https://databard.persidian.com/api/mcp/tools                          # expect HTTP 200
curl -i -X POST https://databard.persidian.com/api/mcp/health-check \
  -H 'content-type: application/json' -d '{}'                                 # expect HTTP 200 (labelled demo analysis, demo:true)
curl -i -X POST https://databard.persidian.com/api/mcp/briefing \
  -H 'content-type: application/json' -d '{}'                                 # expect HTTP 402 + PAYMENT-REQUIRED header (then 200 demo after payment)
curl -i -X POST https://databard.persidian.com/api/mcp/health-check \
  -H 'content-type: application/json' \
  -d '{"source":"datahub","schemaFqn":"db.sales","datahub":{"serverUrl":"http://localhost:8080"}}'   # expect HTTP 200 (DataHub source; demo fallback if unreachable)
curl -i -X POST https://databard.persidian.com/api/mcp/writeback \
  -H 'content-type: application/json' \
  -d '{"source":"datahub","schemaFqn":"db.sales","datahub":{"serverUrl":"http://localhost:8080"}}'   # expect HTTP 200 (write back to DataHub graph)
```

### OKX listing review round 1 — REJECTED, fixed (Sep 2026) — round 2 PASSED: **LISTED Sep 2026** ✅
Verdict: "Payment successful but service returned HTTP 400 — suspected missing
parameters / incorrect invocation method." Root cause: the reviewer agent paid
for `databard_briefing` and invoked it with best-guess params; the old surface
was brittle — `schemaFqn` had to contain a dot (400 otherwise),
`researchQuestion` had to be 8–240 chars (400 otherwise), no parameter aliases,
no `{arguments:...}` envelope unwrapping, and an unreachable data source →
error. A reviewer with no credentials could never succeed. Fixes (in code):
- `src/lib/mcp.ts` — lenient parser: envelope unwrapping (`arguments`/`input`/
  `params`/…), FQN aliases (`schema`/`fqn`/`dataset`/`schema_fqn`/…), source
  spelling normalisation + connector-block fallback, missing FQN → `demo.uniswap`
  (no 400), researchQuestion dropped/truncated instead of 400ing.
- `src/lib/mcp-demo.ts` — `fetchSchemaMetaLenient`: unreachable source → the
  labelled Uniswap demo fixture with `demo: true` + actionable
  `connectionNotice`, as a **200**. `demo: true` in the body forces it.
- `src/app/api/mcp/tools/route.ts` — input schemas now carry `examples`
  (including the bare `{demo:true}` reviewer posture) and explicit "omit
  everything for a demo analysis" guidance.
- Unit-tested: `tests/mcp-parse.unit.ts` (12 tests, in `test:unit`).
- **Agent-first upgrade shipped before resubmitting** (commits `0c794ad`, `6e0627a`):
  `summary` / `keyFindings` / `nextStep` + `serviceVersion`/`generatedAt` on both
  routes; `audio: "inline"|"url"|"none"` on the briefing (default `"none"` text-only since Sep 25 — narration is opt-in);
  writeback degrades to a labelled demo (200, `writeBack.delivered: false`) instead
  of 500ing on an unreachable DataHub. Prod self-check re-verified after deploy.
- **RESUBMITTED Sep 7, 2026** via `onchainos agent activate --agent-id 9878
  --preferred-language en-US` (had to restart the `okx-a2a` daemon first — it dies
  with the terminal session; `okx-a2a doctor` / `daemon start` if activate fails
  the readiness gate). Response: `submitApproval: { approvalStatus: 2, success:
  true }` = under review. Watch: `onchainos agent get-agents --agent-ids 9878`.
  If round 2 fails, ask OKX for the reviewer's exact invocation payload.
- **LISTED (Sep 8, 2026):** round 2 review passed — email confirmation received,
  `approvalStatus` flipped to `4` (approved) on agent #9878. DataBard is now
  visible/searchable on OKX.AI and eligible for recommendation. No further
  registration steps remain; future updates go through the Agent conversation.
- **DE-LISTED again (found Sep 23, 2026):** `onchainos agent service-list --agent-id 9878`
  shows `approvalStatus: 6`, `status: 2` (listed agents such as #2023 show `4` / `1`),
  and #9878 no longer appears in `agent search`. Remark: Data Briefing "never responded
  to any test request (timeout, no status code)". Exact rejection date is not exposed by
  the CLI; the last `updatedAt` before Sep 23 was **2026-09-21 14:50:46 UTC**, identical
  across #9878, #9874 (OnPoint) and #6462 (Wowowify), which are all also `6`/`2` —
  check the owner email for OKX's notice. Likely cause: the paid briefing took ~23s
  (Grove upload blocked the response); fixed Sep 23 (`a9bd389`, ~1.8s paid). The prod
  watchdog logged only one outage (2026-09-22 06:10, ~5s), after that timestamp.
  `salesCount: 2` comes from our own paid test calls on Sep 23, not real buyers.
  Relist: `okx-a2a doctor --fix` (needs interactive login), then `agent update`
  (add Service Health Score) → `agent activate --agent-id 9878 --preferred-language en-US`.
- **Round-3 rejection (Sep 25, 2026):** same symptom — paid Data Briefing "timeout,
  no status code". The unpaid 402 answered in ~0.2s, so the post-payment handler
  was the culprit: a bare `{}` paid call defaulted to `audio:"inline"` (8–10 TTS
  calls + SFX, 10–20s), `syncSettle:true` blocked on confirmation, and any TTS
  failure 500'd/hung the paid call. Fixes (deployed Sep 25, self-check green):
  default audio `"none"` (bare paid call ~1–2s text; narration opt-in via
  `audio:"url"|"inline"`); TTS wrapped in a 25s budget that degrades to text-only
  200 instead of throwing (`BRIEFING_TTS_TIMEOUT_MS`); `syncSettle:false`;
  **scoped fresh re-verification** (`recheckServicesLive` in
  `src/lib/marketplace-index.ts`): scoped briefings re-run the cron's unpaid
  checks + budgeted paid verification (same gates, $0.10/call cap + shared
  $1/day ledger, per-service 15s budget via `BRIEFING_LIVE_TIMEOUT_MS`) for just
  the named services, answering `freshness: live|partial|cached` + per-service
  `fresh`/`checkedAt` (`fresh:false` opts out). Unit-tested:
  `tests/briefing-live.unit.ts` (10 tests, in `test:unit`). Relist pending.
Before resubmitting: deploy, run the self-check above against prod, then
resubmit the listing through the Agent conversation as the email instructs.

### Registration status (registered; listing currently NOT live — see de-listing note above)
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
- Local `.env` is gitignored; the deploy script never ships it. Never dump env into repo files either (`*.bak` / `.env.bak*` are gitignored as a backstop — Sep 2026: a plaintext `.env.bak` with live keys sat unignored in the root until deleted). Never `npm install` on `snel-bot` for this app.

### Remaining steps (user actions)
1. ~~Wait for OKX final approval~~ Listed Sep 8, 2026 — **de-listed by Sep 23 (approvalStatus 6); relist pending.**
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

## Jev Intent Layer (Optionality)

Jev is an optional intent-based evaluation layer that can be layered on top of the existing synthesis engine. It does **not** replace any current pipeline — it adds a new dimension: reading *intent* from column headers, queries, or prompts and producing instant classifications (~100ms, pennies per call).

### Concept

DataBard currently reads data and produces health scores, trend narratives, and recommended next steps via the LLM synthesis engine. Jev offers a complementary mode: **the user types an intent, and Jev figures out what they want from the data and classifies each row in real-time.**

### Example patterns

- User types "Urgency" as a column header → Jev reads the data and rates each finding from "no follow-up needed" to "urgent" in ~100ms
- User types "Confidence" → Jev reads each data anomaly and assigns a confidence score
- User types "Priority" → Jev reads the data estate and ranks findings by impact

### How it would work (additive, not replacement)

1. The existing synthesis engine (`synthesize`, `synthesize-stream`) continues to run unchanged
2. A new optional `jev-intent` flag triggers Jev-based classification on top of the data
3. Jev reads the column intent, queries the data via the existing adapters (`datahub-adapter`, `monid-adapter`), and returns classifications
4. Results are displayed alongside the existing health scores and narratives

### Why optionality

- The LLM synthesis engine captures *meaning* — Jev captures *intent-driven classification*
- Not every query needs intent-based rating — the user chooses when to invoke it
- Jev is ~100ms and pennies — it's a real-time co-pilot, not the main analysis engine
- If Jev is unavailable or the user doesn't want it, the existing pipeline is untouched

### Architecture sketch

```
User types intent (e.g., "Urgency")
        │
        ▼
[jev-intent router] ← optional, opt-in
        │
        ├── reads data via existing adapters (datahub-adapter.ts, monid-adapter.ts)
        ├── sends intent + data to Jev
        └── returns: per-row classification with confidence scores
                │
                ▼
    Displayed alongside existing health scores, trend narratives, next steps
```

### Key files to reference (if implementing)

- `src/lib/schema-analysis.ts` — existing health score, critical tables, trend diffs (unchanged)
- `src/lib/datahub-adapter.ts` — existing DataHub GMS adapter (reused for data access)
- `src/lib/monid-adapter.ts` — existing Monid metered-endpoint adapter (reused)
- `src/app/api/mcp/health-check/route.ts` — existing free health-check (could expose Jev ratings)
- `src/app/api/mcp/briefing/route.ts` — existing paid briefing (could include Jev intent layer in output)

---

## Monid integration (We Kill hackathon)
DataBard is entered in Monid's **"We Kill" hackathon** (Sep 1–10, 2026). Monid is
the "OpenRouter for agent tools" — one API key, 1,900+ metered endpoints, per-call
cost in the run result. We added a **generic** `monid` data source: any
`provider` + `endpoint` (from `monid discover`/`inspect`) is run live, its result
rows are mapped to a health score, and the **measured per-run cost** is carried
through as a receipt. See `docs/MONID_HACKATHON.md`.

### How it works
- `src/lib/monid-adapter.ts` shells to the `monid` CLI via `execFile` (never a
  shell — the Coral precedent): `run -p <provider> -e <endpoint> -j --wait`
  (+ `-i <bodyJSON>`; `--query`/`--path` take a **single JSON string** each —
  verified against `monid run --help`, CLI 0.1.7). `parseMonidRun` → `extractRows`
  → `inferColumns` → `buildMonidSchema` produce one `SchemaMeta` table from an
  arbitrary result shape (named container → top-level array → nested object-array
  → array-of-arrays + header → single flat object → honest `[]`).
- Routed through `metadata-adapter.ts` (`listSchemas` + `fetchSchemaMeta`) and
  threaded through every config builder (`mcp.ts`, `/api/connect`, `pipeline.ts`,
  `synthesize`, `synthesize-stream`, `validate-schema`).
- **Cost receipt:** `getMonidCost(schemaFqn)` (retrieve-and-consume sidecar, like
  `getDuneTableStats`) is surfaced as `monidCost` on `/api/mcp/health-check` and
  `/api/mcp/briefing`. `/api/mcp/tools` advertises `monid` in the source enum, the
  connection schema, and the health output schema.

### Credentials (env-first + body override)
- `MONID_API_KEY` — server env (preferred). A request may override with
  `monid.apiKey`. **The CLI (0.1.7) reads NO key env var** — it uses a YAML
  credential store under `~/.config/monid/` — so the adapter materialises a
  throwaway 0600 store per run and points `XDG_CONFIG_HOME` at it (verified live
  against the installed CLI). Env-first means server-side runs spend **our**
  balance, so the existing rate limit (60/hr/IP on health-check) is the guard.
- `MONID_BIN` (default `monid`), `MONID_TIMEOUT_MS` (default 130000 — must exceed
  the CLI's max `--wait` of 120s), `MONID_MAX_BUFFER` (default 10MB). The CLI must
  be installed on the server (`npm i -g @monid-ai/cli`); see `.env.example`.

### Honest errors
`MonidCliError` classifies failures: **hard** (not-installed / no-key / auth /
balance / bad-request) are surfaced as actionable HTTP **400** (never a 500 or a
stack trace); **soft** (timeout / rate-limit / exec / empty / parse) degrade via an
`execNote` in the schema description, keeping the cost receipt.

### Status / gates (verified Sep 8, 2026 — SUBMISSION-READY)
- **Step 0 discovery DONE (spending half):** key added (label `databard`, also
  secured in the macOS keychain, service `monid`; balance $1.00). **Kill target
  locked: `surf /dex/token/price`** ($0.006/call, stable, verified — 43 OHLCV
  rows, PEPE 4h×7d) with **`defillama /coins/prices/current/{coins}`** as the
  free companion ($0/call, 3 token prices). Confirming runs: defillama
  `01M20QRJE03VJZ2RTRSA74S2YH` ($0), surf `01M20R1KGAP4KS66DPAF3JR5F1` ($0.006).
- **Live verification DONE — local AND prod:** `POST /api/mcp/health-check` with
  `source:"monid"` returns a real analysis (score 95/100, 43 rows) plus the
  measured-cost receipt. **Prod is verifiable by any judge with one curl** (see
  the curl in `docs/MONID_HACKATHON.md`). Prod needs `MONID_API_KEY` +
  `MONID_BIN=/home/deploy/.local/bin/monid` in `/opt/databard/.env` and the CLI
  installed on the box (`npm i -g @monid-ai/cli --prefix ~/.local` — global npm
  is not writable there). Each prod Monid health-check spends ~$0.006 of our
  balance; the 60/hr/IP rate limit is the guard.
- **Agent-first alias fix:** `mcp.ts` accepts Monid-inspect-style
  `queryParams`/`pathParams`/`body` keys as aliases for `query`/`path`/`inputs`
  (+2 tests; `tests/mcp-parse.unit.ts` now 15 passing). Unreachable source still
  degrades to the labelled demo (200, `demo:true`).
- **Wizard UI (Part G) is not built:** Monid is driven via the A2MCP endpoints for
  now. The `monid` keys exist in the label/help maps (so `tsc` passes) but Monid is
  intentionally **not** in the `ConnectStep` picker.
- **Video + social remain** (user actions). The `<90s` shot list +
  5-platform posting checklist live in `docs/MONID_HACKATHON.md`. **Re-verify the
  Dune Plus price at `dune.com/pricing` before it appears in any copy** — the page
  is JS-rendered and scrapes empty; keep "≈$349–390/mo" or omit the number.
- Unit-tested offline: `tests/monid-adapter.unit.ts` (36 tests over the pure
  mapping layer — no CLI, no key).

## Public reports and agent discovery
- `/` is the report-first landing; explicit `?workspace=`, `?persona=`, and `?start=` routes retain the analytical wizard in `src/components/wizard/WizardHome.tsx`.
- `/agents` is the human-readable agent-tool entry point; its free example sends only `{ demo: true }` to `/api/mcp/health-check`. `/probe` keeps paid invocation details separate from the no-payment preview.
- Homepage examples are computed from one captured listing set in `src/lib/report-examples.ts`; client selection never reruns analysis. `src/lib/report-evidence.ts` projects existing report values without changing ranks or scores.
- `ReportEvidenceExplorer` links report questions to charts, comparisons, and methodology. `PublicationFrame` reflects actual checkout states; it never simulates payment progress.
- Focused non-browser checks: `DATABARD_DATA_DIR=/tmp/databard-interaction-tests npx tsx --test tests/report-examples.unit.ts tests/report-surfaces.unit.tsx tests/checkout-recovery.unit.ts`, then `npx tsc --noEmit`.
- The current ESLint configuration does not match TS/TSX files; an ignored-file warning is not a successful lint check.
