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

## The wedge: the verdict for the agency conversation

**Repositioned 6 Nov** after landscape + incentive analysis. We do *not* sell "data audits" — nobody wakes up wanting one, the free roast undersells the paid one, and audits-as-homework have no purchase motive. The buyer is a **marketing director or founder heading into a renewal / QBR / budget fight** who needs third-party proof their numbers are (or aren't) below market. The deliverable is ammunition, dated and cited, from someone who isn't selling the retainer.

**Why the moment, not the persona:** the need is episodic and urgent (renewal is a date, not a mood); the stakes are $2.5–10k/mo retainers so £99 is trivial; and Tavily shows "hold your agency accountable / evaluate before renewal" is a searched genre where agencies write the advice but nobody sells the evidence.

**Landscape checks (Tavily, 5–6 Nov):** subscriptions (Triple Whale ~$429/mo, Polar $300–450/mo, Varos benchmarks) sell dashboards, not verdicts; agency audits run $1,500–$5,000 *and are lead-gen for retainers*; Fiverr sells human Shopify audits at £50–200 with no benchmark stakes; SEO-audit history proves standalone paid audits survive **only with human involvement** — so the analyst-call tier is the legitimizer, not a luxury. White-label lead-gen widgets are commoditized ($39/mo SEO tools) — skipped.

**Two prices + the call:**

| Price | SKU | Deliverable | Role |
|---|---|---|---|
| £99 | `databard_health_plus` | "The Scorecard" — benchmarked verdict report + cited category norms + 3-step plan, same-day | **Target** — the evidence |
| £249 | `databard_health_operator` | Scorecard + 30-min analyst prep call + 4 weekly re-checks | **Legitimizer** — the person who defends it |
| £40/mo | existing Pro | Weekly verdict digest | Continuity — sold post-purchase |

*Dropped: £29 snapshot. At ammunition stakes, £29 reads as not-credible, not cheap — two prices is cleaner. (The Stripe price + SKU still exist server-side for any early orders.)*

**Benchmark sourcing — honest correction:** Elfa is a *crypto* social-intelligence API (token attention, KOL momentum) — it does not carry e-comm category benchmarks. Benchmarks come from **Tavily-researched published studies** (Varos/Klaviyo/Yotpo category norms) joined to the brand's data; **Elfa is a context layer for web3-adjacent targets only**, not the benchmark engine. Either way the output stays an internal data-quality diagnosis, not an investment signal.

**Distribution shift:** ads don't target "growth teams" — they target the *moment*: "evaluate agency", "agency renewal", "QBR marketing" queries and director-level communities. The roast stays the viral free front door; the verdict card it produces is the teaser.

**Pricing alignment:** maps to `docs/STRATEGY.md`'s two front doors — free `/roast` verdict → one-off scorecard (£99/£249) → **Pro £40/mo** for continuity.

## State as of 6 Nov — the loop is live (test mode)

Proven end-to-end on production with two real Stripe test purchases (£29 + £99):
`/roast` upsell → `POST /api/checkout/audit` → hosted Checkout → webhook writes
`data/audit-orders.json` → `/audit/[sku]` success page → `POST /api/audit/deliver`
generates the report (Tavily benchmarks, honest caveats) and emails it via the
notifications ladder.

- Stripe: product `DataBard Health Audit` + 3 `price_*` in prod's account; webhook endpoint already existed; `STRIPE_PRICE_HEALTH_*` + `ADMIN_SECRET` + `TAVILY_API_KEY` set in prod `.env`.
- Bugs the live E2E caught: checkout sessions were card-only'd (payment-method picker removed); `req.nextUrl.origin` → `0.0.0.0` behind the proxy (also fixed latent Pro-checkout bug); SMTP `:465` is outbound-blocked on the host (moved to `:587`; timeouts added so a dead channel fails fast, not silently).
- **Blockers for real money:** prod runs `sk_test` (flip = live keys + recreate prices in live mode + new whsec); Resend free tier only emails the account owner until `persidian.com` is verified at resend.com/domains.

## Build plan (Build 5–13 Nov)

| Day | Work | Cursor |
|---|---|---|
| 5 Nov | `docs/SHIPYARD_MMM_2026.md` plan + @Organiser pre-approval check (rule 09) | yes |
| 6 Nov | ✅ DONE: checkout endpoint + prices + webhook ledger + `/audit/[sku]` success page + `/roast` three-tier upsell + deliver route + report email — E2E-tested live (test mode) | yes |
| 7 Nov | Descoped Elfa adapter (context-only for web3 targets; benchmarks come from Tavily instead) → report renderer polish: PDF export + internal-data intake for paid orders | yes |
| 8 Nov | Buyer-side internal-data capture (roast → order handoff so `score`/`findings` auto-fill at delivery) + Pro upsell CTA | yes |
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
