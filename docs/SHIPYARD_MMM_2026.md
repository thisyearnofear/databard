# Shipyard × Make Me Money 2026 — DataBard Plan

**Event:** Shipyard "Make Me Money" — 2 Nov → 18 Nov 6pm (freeze), Demo Day 21 Nov (London). £100 team budget to make real money from real strangers. Stripe sales count automatically via `/stripe connect`; other sales self-reported + audited.
**Live URL:** https://databard.persidian.com
**Repo:** https://github.com/thisyearnofear/databard
**Budget:** Replit Pro (landing page — partner credit; must deep-link back to a UTM-tagged `/roast` so `src`/`med` attribution survives the host switch) + £30–£50 Tavily-researched ad push + misc; product infra stays on the existing host, so the £100 is mostly acquisition, not build.

## Why DataBard fits Shipyard

- **Allowed category:** data-audit / BI SaaS — "audits, research, datasets, tools" sold to businesses. Explicitly *not* financial advice, trading, or speculation.
- **Real strangers with real willingness to pay:** e-com growth teams and small brands with fragmented data (Shopify sales, reviews, ads, inventory) pay for a single answer to "my numbers look bad — *why?*"
- **Stripe Checkout already live** (`src/app/api/pro/auth/stripe/route.ts` + `src/app/api/webhook/route.ts`; `STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID`/`STRIPE_WEBHOOK_SECRET` in `.env.example`). A new Checkout price + a `/roast`→upgrade CTA lands the SKU. No new payment infrastructure.
- **Built-in viral hook:** `/roast` and `/league` are already on the live site and shareable by design — the cheap, stranger-paying funnel Shipyard rewards.
- **Partner credits:** Tavily (prospect research + the `/roast` differentiation pass), Replit (landing page), SurrealDB (per-team audit memory), ElevenLabs (optional narrated audit brief).

## The SKU ladder: `databard_health_*`

**Hook:** A brand shares its `/roast` card (e.g. "my review velocity is 40% below category"). DataBard offers a tiered, one-off audit — Stripe Checkout.

**Three prices (compromise-effect structure):**

| Price | SKU | Deliverable | Role |
|---|---|---|---|
| £29 | `databard_health_snapshot` | Score + top finding + one benchmark stat — instant, automated | **Decoy** — makes £99 the obvious compromise |
| £99 | `databard_health_plus` | Full audit report + category benchmarks + 3-step action plan | **Target** — the one we want to sell |
| £249 | `databard_health_operator` | Audit + 30-min analyst call + 4 weekly re-checks | **Anchor** — reframes £99 as sensible, covers real time if taken |
| £40/mo | existing Pro | Weekly digest | Underneath — recurring ≠ one-off, sold post-purchase ("get this every Monday") |

**Output:** a dated, receipted (`docs/PORTABLE_EVIDENCE.md`) report + action plan. Stripe `price_*` per SKU; same Checkout + webhook path, price resolved server-side from `STRIPE_PRICE_HEALTH_*` env vars.

**Landscape check (Tavily, 5 Nov):** subscriptions (Triple Whale ~$429/mo, Polar $300–450/mo) sell dashboards, not answers; agency audits run $1,500–$5,000; "free audits" are lead-gen. The one-off, instant, receipted audit sits in a real gap.

**Benchmark sourcing — honest correction:** Elfa is a *crypto* social-intelligence API (token attention, KOL momentum) — it does not carry e-comm category benchmarks. Benchmarks come from **Tavily-researched published studies** (Varos/Klaviyo/Yotpo category norms) joined to the brand's data; **Elfa is a context layer for web3-adjacent targets only**, not the benchmark engine. Either way the output stays an internal data-quality diagnosis, not an investment signal.

**Pricing alignment:** maps to `docs/STRATEGY.md`'s two front doors — free `/roast` preview → one-off audit ladder (£29/£99/£249) → **Pro £40/mo** for continuity.

## Build plan (Build 5–13 Nov)

| Day | Work | Cursor |
|---|---|---|
| 5 Nov | `docs/SHIPYARD_MMM_2026.md` plan + @Organiser pre-approval check (rule 09) | yes |
| 6 Nov | `src/lib/elfa.ts` adapter (social + market reference fetch) + benchmark join + `ELFA_API_KEY` in `.env.example` | yes |
| 7 Nov | `/roast` → paid-upgrade modal + new Stripe `price_health_plus` + webhook guard (not Elfa-dependent — ship internal-data findings if the adapter slips) | yes |
| 8 Nov | Audit-report renderer (PDF + 3-step action plan) + Pro upsell CTA | yes |
| 9 Nov | Replit landing page + 50 Tavily-researched targets | yes |
| 10 Nov | End-to-end test: roast → Checkout → report + Pro | yes |
| 11–13 Nov | Push to first strangers (growth-discord crews, indie-founder list) | yes |

## Earn (5–18 Nov)

- `/spend` every ad/freelancer/API call against the £100 budget, with receipts.
- `/touch` every human hand in the demo funnel (rule 04).
- `/stripe connect` with a read-only `rk_live_…` key — sales count automatically.
- Daily running-total reports to the team channel for any non-Stripe sales.

## Audit prep (evidence pack due 19 Nov)

- Git repo = evidence. `git log` shows the Elfa adapter commit + Checkout commit.
- Full agent logs (`/roast` → report) + prompts preserved.
- Receipts for every £ spent.

## Red lines — stayed away from the disqualified pile

| Disallowed for Shipyard | How DataBard stays on the right side |
|---|---|
| financial advice / lending | we audit *data quality*, not portfolios |
| trading / speculation | no positions taken; no tokens sold to end-customers |
| launching memecoins/NFTs for resale | we benchmark *other* brands; DataBard's Solana anchoring is integrity receipts, not resale tokens |
| money from people you know | target list = growth teams / strangers acquired via ads + viral roasts |
