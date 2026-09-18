# DataBard Unit Economics

*Rewritten 18 September 2026. The old doc centered the $49/month Teams
subscription. The business now has three revenue shapes — editions, per-call
agent tools, and the legacy Pro tier — and this doc tracks each.*

## The numbers that matter

| Revenue shape | Price | Marginal cost | Margin | Status |
|---|---|---|---|---|
| **Commissioned edition** | $25 one-off (PUSD/SOL/USDC) | ~$0 (deterministic compute over cached public data) | ~100% | Live; sales unproven |
| **`databard_briefing`** (x402) | $1.00/call | ~$0.30–0.35 (Flash TTS + bookends SFX) | ~$0.65 (~65%) | Live; real calls, volume unproven |
| **`databard_probe`** (x402) | $1.00/call | ~$0.01–0.12 (outbound payments to probed services) | ~88–99% | Live; real calls, volume unproven |
| **Pro subscription** (wizard) | $49/month | ~$3.40/month per team at 1 schema (TTS-dominated) | ~$45/team | Kept; no longer the lead offer |
| **Free tools** (`health-check`, `writeback`, probe preview) | $0 | ~$0 | — | Acquisition |

The edition is the standout: because public reports are computed
deterministically from cached public data — no LLM, no TTS — a published
edition costs effectively nothing to produce. The $25 is almost pure margin.
This is the economic argument for the deterministic pipeline, not just the
trust argument.

---

## Cost detail

### Editions: why marginal cost is ~$0

- Computation is deterministic (`computeEarnEdition`) over a cached public
  dataset (`loadEarnListings`) — no LLM, no TTS, no per-publish API spend.
- The receipt is a local SHA-256 (`src/lib/evidence-receipt.ts`).
- Settlement is a Solana transfer the customer pays network fees on ("network
  fees are additional" is on the pricing copy).
- What remains is hosting amortisation and storage, both negligible per page.

### x402 briefing: TTS is 95% of variable cost

| Component | Model/Tier | Usage | Cost |
|---|---|---|---|
| Script generation | GPT-4o-mini | ~5,000 tokens | $0.001 |
| Voice synthesis | ElevenLabs Flash (scoped via `BRIEFING_TTS_MODEL`) + bookends SFX (`BRIEFING_SFX_MODE`) | ~2,000 chars + SFX | ~$0.30–0.35 |
| Settlement | x402 on X Layer (USDT0) | 1 transfer | dust |
| **Total per briefing** | | | **~$0.30–0.35** |

Settlement fires only after the handler returns <400 — a failed synthesis
never charges the caller, so we never earn revenue we have to refund.

### Probe: bounded outbound spend

A Probe call's cost is the payments it makes to candidate services plus gas and
the optional attestation write. Live observation (18 Sep full-candidate run):
actual outbound spend was **$0.01001** — the $0.12 figure is a conservative
ceiling, not the norm.

Guardrails in `probe-runner.ts`:

1. **Outbound spend cap** — `MAX_OUTBOUND_SPEND_USD` (default $0.50) checked
   before each paid call; remaining paid candidates are skipped with an honest
   error in the response.
2. **1-hour result cache** — payment-mode-aware (`paid:`/`free:`), so repeat
   probes don't re-spend and free previews never poison paid results. Hard
   failures are never cached.
3. **No LLM / no TTS** — pure HTTP + JSON parsing; variable cost stays near
   zero at any volume.
4. **User-supplied candidates capped at 10**, each under the same spend cap.

### Pro subscription (legacy/supporting surface)

Cost per weekly wizard briefing: $0.64–$1.07 (TTS-dominated; the Flash lever
drops it ~50%). At $49/month and 3–5 schemas per team, margin is $31–45/team.
The tier still works and still pays its way, but it is no longer where growth
is expected from.

---

## Fixed monthly costs

| Item | Cost | Notes |
|------|------|-------|
| VPS (shared, PM2) | $5–10 | `snel-bot`; Next.js standalone + stay-alive cron |
| ElevenLabs Starter | $5 | Required for API access (wizard + x402 briefing) |
| Resend Pro | $20 | Optional — free tier covers 3,000 emails |
| Domain | $1 | persidian.com |
| **Total fixed** | **$11–36** | |

---

## The PG question: "Are you default alive?"

Reframed for the three shapes:

- **Editions alone:** one edition per day ($750/month) covers fixed costs ~20×
  over at near-zero marginal cost. The constraint is distribution, not cost.
- **Probe alone:** 5 paid calls/day ≈ $150/month revenue against ~$18/month
  worst-case COGS — fixed costs covered by the oracle alone.
- **Old framing:** 10 paying Pro teams ($490/month) still works, ~$350/month
  net. It's just no longer the plan of record.

The honest state: all three shapes are margin-positive per unit. None has
proven volume. The next dollar of effort goes to distribution (Phase 11), not
cost optimisation.

---

## What we don't know yet

1. **Will anyone pay $25 for a dated page?** The first three real edition
   sales answer this. Free previews remove price as the barrier to reading;
   publishing tests value.
2. **Do agents come back?** Real calls are happening; the repeat rate is the
   number that matters.
3. **Does the loop loop?** If shared previews don't produce new previews, the
   distribution model needs rethinking before Phase 12.
4. **Is $25 the right price?** Untested. The first ten payments are the price
   test, not a survey.
5. **What's a sponsored edition worth?** Unknowable until Phase 11 produces
   distribution numbers to sell against.

---

## Method

Costs are calculated from the codebase:

- `src/lib/editions.ts` + `src/lib/superteam-earn.ts` — deterministic edition computation
- `src/lib/evidence-receipt.ts` — local SHA-256 receipts
- `src/lib/x402.ts` — x402 settlement (OKX Payment SDK, X Layer)
- `src/lib/script-generator.ts`, `src/lib/audio-engine.ts` — LLM + TTS for briefings
- `src/lib/probe-runner.ts` — probe outbound spend, caps, caching
- `src/lib/pusd.ts` — edition ($25) and Pro ($49) pricing, SOL/USDC/PUSD rails

Pricing is a hypothesis. The first ten payments in each shape are the test.
