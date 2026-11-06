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

**Landscape checks (Tavily, 5–6 Nov):** every alternative monetizes the *relationship*, not the moment:

| Alternative | Price | Motion | Why it loses |
|---|---|---|---|
| Free agency audits | £0 | Lead-gen → sales call | Auditor wants the retainer — the verdict is the pitch |
| Triple Whale / Polar / Varos | $199–450/mo | Free tier → demo → sales | Dashboard you operate yourself; bills monthly for a once-a-quarter question |
| Agency audits | $1,500–5,000 | Referral networks | Deep but pre-sold on their own retainer; days of turnaround |
| Fiverr/Upwork gigs | £50–200 | Marketplace SEO | No benchmark citations, no receipt that survives a meeting |
| Fractional CMO | $3–10k/mo | Boutique WOM | Solves ongoing leadership, not one-off proof |
| ChatGPT / free scans | £0 | — | "AI told me" isn't ammunition; no cited norms |

SEO-audit history proves standalone paid audits survive **only with human involvement** — so the analyst-call tier is the legitimizer, not a luxury. White-label lead-gen widgets are commoditized ($39/mo SEO tools) — skipped.

**The fourth motion:** every comparable funnels the buyer into a relationship they didn't want — retainer, subscription, or labor marketplace. Nobody lets you *just buy the answer*. The Scorecard is **Stripe Checkout for a verdict**: fixed price, dated receipt, nothing to renew. The moat isn't the analysis — it's being the only option that wants nothing else from the buyer. The exposure is the same: one-off pricing needs volume of people *in the moment*, so the roast → shared-Scorecard loop is the distribution, not ads.

**Two prices + the call:**

| Price | SKU | Deliverable | Role |
|---|---|---|---|
| £99 | `databard_health_plus` | "The Scorecard" — benchmarked verdict report + cited category norms + 3-step plan, same-day | **Target** — the evidence |
| £249 | `databard_health_operator` | Scorecard + 30-min analyst prep call + 4 weekly re-checks | **Legitimizer** — the person who defends it |
| £40/mo | existing Pro | Weekly verdict digest | Continuity — sold post-purchase |

*Dropped: £29 snapshot. At ammunition stakes, £29 reads as not-credible, not cheap — two prices is cleaner. (The Stripe price + SKU still exist server-side for any early orders.)*

**Benchmark sourcing — honest correction:** Elfa is a *crypto* social-intelligence API (token attention, KOL momentum) — it does not carry e-comm category benchmarks. Benchmarks come from **Tavily-researched published studies** (Varos/Klaviyo/Yotpo category norms) joined to the brand's data; **Elfa is a context layer for web3-adjacent targets only**, not the benchmark engine. Either way the output stays an internal data-quality diagnosis, not an investment signal.

**Distribution shift:** ads don't target "growth teams" — they target the *moment*: "evaluate agency", "agency renewal", "QBR marketing" queries and director-level communities. The roast stays the viral free front door; the verdict card it produces is the teaser.

**Distribution woven into the product (6 Nov):** Thiel — the product should distribute itself. The Scorecard is a *company* purchase but every buyer is an *individual* who shares things that make them look sharp. Two layers:

- **Individual habit (list-build):** "one metric vs your category, every Monday" — a free weekly micro-verdict (one benchmarked stat + cited source, via `MondaySignup`). Career equipment: ammunition for the weekly standup that quietly accumulates 12 weeks of receipts before the renewal meeting. Converts at the seasonal peaks.
- **Shareable artifacts (reach):** roast verdict cards, category-vs-me score posts, and the public "audit the auditors" teardown series — each impression routes back to roast → verdict → "want the cited version? £99". Every artifact carries the moment forward explicitly (renewals cluster Q4 + year-start — concentrate spend there, not steady-state).

**Sequence:** weekly benchmark list + teardown series now → roast/scorecard artifacts carry "get yours" through the quiet months → renewal-season push at the peaks. The weekly email is the product; the Scorecard is the upgrade.

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
