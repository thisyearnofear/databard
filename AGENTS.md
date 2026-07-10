# AGENTS.md — DataBard

## Project Overview
DataBard is a weekly data health briefing tool. The core product is a scheduled audio digest plus dashboard with health scores and trend narratives. Dashboard is the hero; audio is a button on the dashboard.

## Build & Dev Commands
- `npm run dev` — start dev server on localhost:3000
- `npm run build` — production build (71 static pages)
- `npx tsc --noEmit` — type check only
- No test framework configured

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
- `src/app/protocol/page.tsx` — dashboard (hero output)
- `src/components/EpisodePlayer.tsx` — audio player with drill-down
- `src/components/wizard/LandingStep.tsx` — landing page
- `src/app/roast/page.tsx` — "Roast my data" landing variant

## Docs
- `docs/STRATEGY.md` — north star, competitive positioning, product principles
- `docs/GTM.md` — viral hooks, engagement loops, user interview plan
- `docs/PLAN.md` — development roadmap (Phases 1-7)
- `docs/DATA_SOURCES_ARCHITECTURE.md` — tiered source architecture
- `docs/AZURE.md` — Azure OpenAI migration guide
