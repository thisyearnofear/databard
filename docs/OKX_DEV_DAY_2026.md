# OKX Dev Day 2026 — DataBard Probe

**Project:** **DataBard Probe** — a paid trust oracle for the agent economy.
Given a question, DataBard probes a set of candidate A2MCP agent services
(paying each via x402 where required), scores their schema health, latency,
freshness, and price-per-value, then publishes the verdict as an on-chain
attestation on X Layer. Other agents and humans consult the oracle before
spending money on an unknown service.

**Pitch (one sentence):** *"Before an agent pays another agent, it asks
DataBard Probe — is this service worth it?"*

**Track:** **OKX AI — Agents and AI-native businesses** (primary).
**X Layer** is the substrate: x402 settlement for the probes + cheap
attestation writes for the verdict hash.

**Why this wins:** Solves the biggest hole in the agent economy right now —
**discovery + trust**. We already operate an active ASP (#9878, listed
Sep 8, 2026) with a working x402-paid endpoint and a published tool
schema, so the demo is the *new* probe layer on top of real infrastructure,
not a "we integrated OKX this week" pitch.

**Differentiation from Ligis (our other project):**

| | **Ligis** | **DataBard Probe** |
|---|---|---|
| Answers | *Who* is this agent? Are they credentialed? | *How good* is this service right now? |
| Layer | Identity & credentials (ERC-721, EIP-712) | Runtime quality & value scoring |
| Analogy | Driver's license check | Consumer Reports / Yelp rating |
| On-chain artifact | Credential NFT (revocable) | Verdict attestation hash (immutable snapshot) |

They're complementary: Ligis gates *permission*, DataBard Probe gates
*quality*. In Option B, Probe optionally calls Ligis's `okx.ligis.verify`
as one input signal, but the core value stands alone.

**Why you can't just "do it yourself":**

1. **Standardised rubric.** Heterogeneous services return different shapes;
   Probe normalises them into one comparable 0–100 score.
2. **Comparative ranking.** One agent pinging one endpoint gets one data
   point. Probe calls N services in parallel and ranks them.
3. **Longitudinal history.** Probe stores results over time; a single curl
   gives a snapshot with no trend.
4. **On-chain attestation.** The verdict is anchored on X Layer so a
   *third* agent can trust the score without re-running the probe.
5. **Cost aggregation.** Probe pays the per-call fees on your behalf and
   bundles them into one $1 charge — you don't need a funded wallet per
   service.

---

## Differentiation from Ligis

| | **Ligis** (separate project) | **DataBard Probe** (this submission) |
|---|---|---|
| Core question | "Is this agent *authorized* / *credible*?" | "Is this service *performing well right now*?" |
| Layer | Identity & credentials (ERC-721, EIP-712) | Runtime quality & value scoring |
| Analogy | Background check / driver's license | Consumer Reports / Yelp rating |
| Input | Agent wallet address, capability hash | Service endpoint URL + probe call |
| Output | pass/fail credential check, risk score | Composite 0–100 quality score + ranked comparison |
| On-chain artifact | Credential NFT (portable, revocable) | Verdict attestation hash (immutable proof of probe) |

**They are complementary layers, not competitors.** An agent making a
hiring decision ideally calls both: Ligis answers *who* (identity),
DataBard Probe answers *how well* (quality). In the demo, DataBard Probe
can optionally query Ligis's `okx.ligis.verify` as one input signal,
but the core value stands alone without it.

**Why you can't just "do it yourself":**

1. **Standardised rubric.** Each service returns different shapes, units,
   error formats. Probe normalises them into one comparable 0–100 score.
2. **Comparative ranking.** A single ping tells you "it responded."
   Probe calls N services in parallel and ranks them against each other.
3. **Longitudinal history.** Probe stores results over time; a one-off
   curl gives you a single snapshot with no trend.
4. **On-chain attestation.** The verdict is anchored on X Layer so a
   *third* agent can trust the score without re-running the probe.
5. **Cost aggregation.** Probe pays the per-call fees on your behalf and
   bundles them into one $1 charge — you don't need a funded wallet per
   service.

---

## The problem (judge-facing)

The OKX.AI marketplace (and every agent marketplace that follows) has the
same cold-start problem as the early App Store: a long tail of services,
no quality signal, no way to compare two endpoints that both claim to do
"tokenized stock prices." Today an agent either:

1. **Pays blind** — burns budget on a service that might be down, returning
   empty rows, or priced absurdly.
2. **Asks a human** — defeats the point of an agent.
3. **Skips it** — and the agent loses capability.

DataBard Probe is the missing primitive: **a paid, attested, onchain-anchored
quality signal for any A2MCP endpoint**, queried by agents and humans before
they spend.

## The loop (3-minute demo)

1. **User prompt:** *"I need a reliable on-chain token-price feed for my
   portfolio agent. Which service should I pay for?"* → Probe targets:
   Doxa, Onchain Data Explorer, Atlas Data API, PolyDesk (+ DataBard self
   as reference).
2. **DataBard Probe** looks up each endpoint's `/api/mcp/tools` discovery
   doc, then issues a paid probe to each (x402 — $0.05–$0.10 per probe).
3. **Each probe returns:** schema shape, latency, row-count, freshness,
   price-per-call, error rate over the last 24h.
4. **Probe orchestrator** scores each (composite of those signals), ranks
   them, writes the verdict hash to X Layer as a tiny attestation
   (~$0.0001).
5. **UI returns** a ranked card list: *"Onchain Data Explorer — 91/100
   (probe tx `0xabc...`); Doxa — 84/100 (`0xdef...`); …"*. Each card
   links to the on-chain attestation.

**The "wow" moment:** the agent-to-agent money flow visible in a single
screenshot — DataBard paying 4 services and getting paid 1 service in the
same demo.

## What we build (Sep 17–25)

### New code (greenfield)

| File | Purpose |
|---|---|
| `src/lib/probe-runner.ts` | Single-endpoint probe: fetch `/tools`, send a tiny valid call, time it, parse response shape, capture errors. Free endpoints skip x402; paid endpoints get a $0.05 probe config. |
| `src/lib/probe-scorer.ts` | Composite score: schema completeness (30%), latency p95 (20%), freshness (20%), price-per-value (15%), error rate (15%). Pure function, unit-tested. |
| `src/lib/probe-attestation.ts` | Write verdict hash to X Layer via the OKX RPC (`eth_sendTransaction` from the Builder Code payout wallet, value 0, data = keccak256(JSON of verdict)). Reads back via `eth_getTransactionByHash`. |
| `src/app/api/agent/probe/route.ts` | Public POST endpoint: `{question, candidates: [{name, endpoint, ...}]}` → `{verdict, ranked, attestations}`. Costs 1 USDT via x402. |
| `src/app/api/agent/probe/[id]/route.ts` | GET: read past verdicts + their on-chain attestations (free). |
| `src/app/probe/page.tsx` | Demo UI — one input box ("What are you trying to do?"), candidate picker (defaults: Doxa, Onchain Data Explorer, Atlas Data API, PolyDesk, DataBard self; user can add custom A2MCP endpoints), ranked results with attestation links. |
| `src/components/probe/ResultCard.tsx` | The score card with attestation explorer link. |
| `tests/probe-scorer.unit.ts` | Scoring edge cases (missing fields, ties, paid vs free weight). |

**Shipped vs plan deltas** (the table above is the design intent; final
implementation):
- Scorer weights are schema 25 / latency 18 / freshness 17 / price-value 13 /
  reliability 13 / credentials 14 (six dimensions; Ligis credential check is
  the sixth, not "error rate over 24h" — a single probe run has no history).
- Outbound payments sign with the dedicated probe wallet
  (`PROBE_PAYER_PK` = `0x49D5…FA8D8`), not the Builder Code payout wallet; the
  attestation key falls back from `PROBE_ATTESTATION_PK` to it.
- `/api/agent/probe/[id]` (verdict history) is NOT built — verdicts are
  stateless; the on-chain attestation is the history.
- UI is question input + "Run free preview" + "Check paid agent endpoint"
  (with a 402 explainer), not a candidate-picker — candidates come from the
  request body (agent path) or the curated default set.
- `POST /api/probe/preview` was added (free, no outbound payments, 10/hr) as
  the browser demo path.
- Hardening added beyond the plan: SSRF guard (private/loopback URLs rejected
  before network I/O), payment-mode-aware 1-hour cache (free and paid probes
  never share entries), `rateLimit` + `probe_run` event on the paid route.

### Reused (don't touch)

- `src/lib/x402.ts` — paid-endpoint wrapping (already in production)
- `src/lib/mcp.ts` — A2MCP input parser
- `src/lib/events.ts` — `track("probe_run", { candidate, score })` event
- `src/lib/monid-adapter.ts` — for the optional Monid-powered probe source
- `docs/OKX_AI_ASP.md` — already lists the live endpoints we'll probe against

### Demo data: real external A2MCP endpoints (verified via `onchainos agent search`)

These are **live, third-party** services on the OKX.AI marketplace that
DataBard Probe will actually call during the demo. No stubs needed for the
primary candidates.

| # | Agent / Service | ID | Endpoint | Price | What we probe |
|---|---|---|---|---|---|
| 1 | **Doxa** — Structured Data Validate | #9626 | `https://doxa.ivaronix.xyz/a2mcp/schema.validate` | $0.005 | Schema completeness, latency, response shape |
| 2 | **Onchain Data Explorer** (OKX) — Token Metadata | #2023 | `https://www.oklink.com/api/v5/explorer/mcp/x402/get_token_info` | $0.01 | Latency, freshness, field richness |
| 3 | **Atlas Data API** — Market Signal | #11194 | `https://0m.ar/api/market-insight` | $0.00001 | Latency, response shape, error handling |
| 4 | **PolyDesk** — Football Match Live Data | #5427 | `https://polydesk-i96m.onrender.com/api/a2mcp/worldcup-live-scores` | $0.10 | Latency, freshness (live scores), schema |
| 5 | **DataBard self** — health-check | #9878 | `https://databard.persidian.com/api/mcp/health-check` | Free | Reference card ("we score ourselves too") |

**Monid endpoints (already integrated via adapter):**

| Provider | Endpoint | Price | Use in demo |
|---|---|---|---|
| `surf` | `/dex/token/price` | $0.006 | OHLCV data-quality probe |
| `defillama` | `/coins/prices/current/{coins}` | $0 (free) | Free-tier baseline comparison |

**Fallback policy:** If a real endpoint is unreachable on demo day, the probe
returns a labelled `"status": "unreachable"` card with score 0 — same
honest-failure pattern as `mcp-demo.ts`. **Never fake a score.**

### x402 cost model

| Direction | Per-call | Notes |
|---|---|---|
| User → DataBard Probe | $1.00 USDT | Same pricing shape as `databard_briefing` |
| DataBard Probe → candidate (if candidate is paid) | $0.05–$0.10 | Set per-candidate; configurable |
| X Layer attestation write | ~$0.0001 | X Layer gas is negligible |

Per demo run: ~$1 in + ~$0.20–$0.40 out = ~$0.60–$0.80 margin if we bill
$1. Cost for 5 demo runs at the live finale: ~$3. **Pre-fund the wallet
with $20 USDT0 on X Layer before Sep 25.**

### Economics & sustainability

**Margin:** ~88% gross margin per call ($1.00 revenue − ~$0.12 COGS).
This is the best margin in the DataBard suite because there is no TTS or
LLM cost — just HTTP calls and a tiny on-chain write.

**Sustainability guardrails (built into `probe-runner.ts`):**

1. **Outbound spend cap** (`MAX_OUTBOUND_SPEND_USD = $0.50`): before each
   paid call, the runner checks remaining budget. If cumulative cost would
   exceed the cap, remaining paid candidates are skipped and marked
   `"skipped": "spend cap reached"`. Worst-case COGS is bounded well below
   the $1.00 price.
2. **1-hour result cache**: repeat probes for the same endpoint + body
   within one hour return the cached result without re-spending. Multiple
   callers asking about the same service trigger only one outbound call.
3. **No LLM / no TTS**: the probe pipeline is pure HTTP + JSON parsing,
   keeping variable cost near zero regardless of volume.
4. **User-supplied candidates capped at 10**, each subject to the same
   spend cap, so a malicious or careless caller cannot force unbounded
   outbound payments.

**Break-even on Probe alone:** at 5 calls/day ($150/month revenue, ~$18/month
COGS) the tool contributes ~$132/month margin before fixed costs.

**Outbound wallet:** a dedicated probe wallet (`0x49D551cA1F2532C82473b6c919d1a099ef5FA8D8`,
funded with 10 USDT0 + 0.01 OKB on X Layer) holds the `PROBE_PAYER_PK`. It is
separate from the revenue-receiving `PAY_TO_ADDRESS`, so probe spend is auditable
and can never drain earnings. Just ensure it holds ≥ $10 USDT0 for outbound
probe payments.

**Why $1.00 (value-based pricing rationale):** the buyer is an agent about to
spend *its own* money on an unknown service. One bad choice — an unreachable
endpoint, a stale feed, a schema the agent can't parse — costs that agent at
least one failed paid call ($0.05–$1) plus retries and wrong data downstream.
A $1.00 quality verdict on up to 10 candidates is therefore cheap insurance:
it is priced against the decision it protects, not against its own COGS. The
cost ladder that makes this legible:

| Tier | Price | What you get |
|---|---|---|
| Free preview (`/api/probe/preview`) | $0 | Same scorer on the curated candidate set, no outbound payments — paid services show an honest "402 challenge" flag. Rate-limited 10/hr. |
| Standard probe (`/api/agent/probe`) | $1.00 | Full probe incl. outbound x402 payments (capped $0.50), ranked verdict, cost receipt, `probe_run` telemetry. |
| Attested probe (`attest: true`) | $1.00 + gas | Same as standard plus the verdict hash anchored on X Layer for verifiable provenance. |

The free tier is the discovery driver (mirrors `databard_health_check`); the
paid tier is where the margin lives.

## Shipping schedule

| Day | Owner | Deliverable |
|---|---|---|
| **Sep 15 (today)** | udin | Submit team application (deadline 23:59 UTC). Confirm builder briefing attendance for Sep 16. |
| **Sep 16** | udin | Attend briefing, grab builder kit, update plan. Decide partner-stub vs real-endpoint strategy for the 4 demo candidates. |
| **Sep 17 (Thu)** | udin | `probe-runner.ts` + `probe-scorer.ts` + unit tests passing. CLI-runnable. |
| **Sep 18 (Fri)** | udin | `/api/agent/probe` route live locally, end-to-end against DataBard's own `databard_health_check`. |
| **Sep 19 (Sat)** | udin | `probe-attestation.ts` writing verdict hash to X Layer testnet → mainnet. |
| **Sep 20 (Sun)** | udin | `/probe` UI working with the 4 named candidates. |
| **Sep 21 (Mon)** | udin | Deploy to prod via `./scripts/deploy.sh`. Verify `curl -i https://databard.persidian.com/api/agent/probe` returns 402 (then 200 with payment). |
| **Sep 22 (Tue)** | udin | End-to-end demo script (3 min). One rehearsal run. |
| **Sep 23 (Wed)** | udin | Buffer — bug fixes, video recording for submission. |
| **Sep 24 (Thu)** | udin | Polish: README in `/probe`, OG image, docstring update. |
| **Sep 25 (Fri)** | udin | **Submit** via the form by 23:59 UTC. Project description + demo URL + GitHub repo + 3-5 min demo video. |

**Solo-team risk:** the entire schedule assumes udin alone. If a collaborator
joins, assign Sep 22–24 (UI polish + video) to them.

## Submission checklist (Sep 25)

- [ ] Working prototype URL: `https://databard.persidian.com/probe`
- [ ] GitHub repo link (public, branch `okx-dev-day-2026`)
- [ ] 3-5 min demo video (mp4, hosted — YouTube unlisted or Loom)
- [ ] Project description (≤500 words): problem, solution, why OKX AI,
      link to ASP #9878
- [ ] One screenshot showing agent-to-agent payment flow
- [ ] On-chain attestation transaction hash from the live demo run

## Risks

1. **x402 client-side payments — RESOLVED.** `@okxweb3/x402-core` exports
   `./client` and `@okxweb3/x402-evm` exports `./exact/client` (confirmed
   from package-lock.json). We can programmatically pay other A2MCP services
   from the server. Need a funded wallet (private key in env `PROBE_PAYER_PK`)
   with USDT0 on X Layer. A **dedicated wallet** has been provisioned:
   `0x49D551cA1F2532C82473b6c919d1a099ef5FA8D8`. Fund it with ≥ $10 USDT0
   before the first live demo. Private key stored in `.env` (gitignored) and
   `/opt/databard/.env` on prod.

2. **Endpoint availability on demo day.** We use real, live A2MCP endpoints
   (Doxa, OKX Onchain Data Explorer, Atlas, PolyDesk). If one is down during
   the demo, the probe gracefully reports `unreachable` with score 0.
   Monid endpoints (surf, defillama) are the backup set since we control the
   adapter and API key.

3. **Attestation wallet key handling.** The X Layer write uses the same
   dedicated probe wallet (`PROBE_PAYER_PK`). Never commit the key to the
   repo; it lives only in `.env` (gitignored) and `/opt/databard/.env` on prod.

4. **Time.** 10 days, solo. The score formula + UI is the bulk of the
   work. If we slip, cut the UI polish, not the score formula or the
   attestation — those are the demo's spine.

5. **Demo video.** Last-day recording is fragile. Record Sep 22 even if
   the product isn't perfect; we can re-record Sep 24 if needed.

## Out of scope (explicitly)

- Building 4 *real* partner A2MCP endpoints — we probe, we don't host.
- Multi-agent synthesis (the existing `databard_briefing` already does this).
- On-chain identity / credential issuance for agents — that's Ligis's job.
  DataBard Probe *consumes* identity signals; it does not issue them.
- Mobile UI (desktop-first for the live finale).

---

## Pitch script (3-5 min, for the Singapore finale)

1. **(30s) Hook.** *"The agent economy has a Yelp problem. There are
   hundreds of A2MCP services. None of them have a quality signal. Agents
   pay blind, or they don't pay at all."*
2. **(45s) The gap.** Show two real OKX.AI services side by side (e.g.
   Onchain Data Explorer vs Atlas Data API), both claiming to provide
   on-chain token data. Visibly different latency, schema richness, price.
   No way to compare without paying each one yourself.
3. **(90s) The demo.** Open `/probe`, type the question, hit run. Show
   the 4 agents being paid via x402 (the wallet toast / explorer links).
   Show the ranked result cards. Click an attestation → X Layer explorer
   shows the verdict hash.
4. **(45s) Why it matters.** *"DataBard is already an ASP on OKX.AI
   (#9878). Probe is the trust layer on top of our existing paid
   endpoint — and on top of everyone else's."*
5. **(45s) The ask / close.** *"We're submitting as OKX AI, with X Layer
   as the substrate. We want to be the trust oracle the agent economy
   needs to grow."*

## Open questions (resolve Sep 16 briefing)

1. Is there a submission template or required format?
2. Are remote-only submissions scored on the same rubric as finalists?
3. Can the attestation write be a no-op for the demo, or is on-chain
   evidence mandatory?
4. Should we register DataBard Probe as a third service on ASP #9878, or
   create a new ASP identity for the hackathon submission?

## Progress log

### Sep 17, 2026
- **Wallet funded & verified**: dedicated probe wallet `0x49D551cA1F2532C82473b6c919d1a099ef5FA8D8`
  holds **10 USDT0** + **0.01 OKB** on X Layer (checked via RPC).
- **x402 client fixed**: `attemptX402Payment` in `probe-runner.ts` now uses the
  real OKX SDK (`x402Client` + `registerExactEvmScheme` + `x402HTTPClient`)
  instead of guessed API; returns `PAYMENT-SIGNATURE` header for retries.
- **Attestation fallback**: `probe-attestation.ts` falls back from
  `PROBE_ATTESTATION_PK` to `PROBE_PAYER_PK`, so the same dedicated wallet can
  sign verdict hashes if attestation is enabled.
- **Env**: `PROBE_PAYER_PK` present in local `.env` and server `/opt/databard/.env`.
- **Quality gates**: `tsc --noEmit` clean; 28/28 probe-scorer unit tests pass.
- **Deployed**: commit `39e2165` shipped via `deploy.sh`, health gate 200.
- **Live paid smoke test PASSED** (`scripts/probe-smoke.mjs`, free self-candidate only):
  - unpaid POST → **402** + `PAYMENT-REQUIRED` header (exact, eip155:196, $1.00, USDT0)
  - paid retry via SDK client → **200**, settlement confirmed on-chain:
    `paymentId 15607032`, tx `0x83a206ea8c423bcbf1ad6261575d87021523d16957def33efa07bd0d67a36a2f`
    (payer `0x49D5…FA8D8` → payee personal wallet)
  - verdict: DataBard self health-check scored 71/100 "good"

### Sep 18, 2026 — 9/10 upgrade
- **Agent discoverability**: `databard_probe` added to `/api/mcp/tools` with
  full input/output schemas + examples (agents can now discover and call it
  like any other A2MCP tool).
- **Free preview route**: `POST /api/probe/preview` — same scorer on the
  default candidate set with outbound payments disabled; paid services return
  an honest "402 challenge" flag. Rate-limited 10/hr. This is the browser demo
  path.
- **UI rewrite** (`/probe`): hero + how-it-works, question input, "Run free
  preview" and "Check paid agent endpoint" buttons, 402 explainer panel with
  decoded challenge, cost receipt line, attestation link to OKLink explorer,
  ResultCard now shows x402 paid / 402-challenge / cached badges.
- **Navigation**: Probe added to the Protocols workspace nav and the landing
  footer.
- **Hardening**: SSRF guard in `probe-runner.ts` (blocks localhost/private
  ranges before any network I/O), `probeAll` `allowPayments` option, settlement
  tx capture from the outbound `PAYMENT-RESPONSE` header, `rateLimit` +
  `probe_run` event + `agentAddress` mapping in the paid route.
- **Response v2**: paid route now returns `cost` (price, outbound spent, cap,
  cached/paid counts), `attestation` object (requested/txHash/error), and
  per-candidate `payment` + `fromCache`.
- **Docs**: value-based pricing rationale + cost ladder in
  `docs/OKX_DEV_DAY_2026.md`; dedicated probe wallet replaces the stale
  Agentic-Wallet line.
- **Quality gates**: `tsc` clean, 28/28 scorer tests, `npm run test:unit` green,
  production build 84 pages, bundle guard passing.
- **Deployed** (release `20260917_115836`, commit `e1778fe`), health gate 200.
- **SSRF guard verified** offline: loopback / localhost / 169.254.169.254 /
  192.168.x / 172.16–31.x / non-http schemes all blocked before network I/O;
  public URLs pass the guard.
- **Free preview live** (`POST /api/probe/preview`): 5 candidates scored with
  zero outbound spend; OKLink + Atlas honestly flagged `402 challenge` /
  "Payments disabled for this run"; Doxa honestly unreachable (score 0).
- **FULL-CANDIDATE PAID RUN PASSED** (the core hackathon feature, first live
  test of outbound x402 payments):
  - inbound: unpaid → 402, paid retry → 200, settlement `paymentId 15608979`,
    tx `0xe989c69580812e902f863491eb38638be8cb17afa1c9f138d948281cd91dc66a`
  - outbound paid **to real third-party services**: Atlas Data API ($0.00001)
    and OKLink Token Metadata ($0.01) — both `challengeReceived: true,
    paid: true`; OKLink settlement tx captured from its `PAYMENT-RESPONSE`
    header: `0x06cc938fd75fa009e1b581781c0b9c0d4fb1ff0e70597cb24678d24e88bdae66`
  - verdict: self 71 (good) > Atlas 58 > OKLink 50 > PolyDesk 42 (free,
    reachable, no x402 challenge) > Doxa 0 (unreachable — honest)
  - cost receipt: `outboundSpentUsd 0.01` of `0.5` cap, `paidCount 2`
  - cache verified payment-mode-aware: a repeat paid run served PolyDesk +
    self from cache (`fromCache: true`) without re-spending
- **Tools discovery**: `/api/mcp/tools` now lists `databard_probe` with full
  input/output schemas and examples.
- UI at `/probe` (nav: Protocols workspace + landing footer) verified 200;
  compiled bundle contains the free-preview button, 402 explainer, cost line
  and x402/cached badges.
- **Smoke re-run after the first full run**: a second paid call (within the
  1-hour TTL) returned 200 and served PolyDesk from the paid-mode cache
  (`fromCache: true`) instead of re-probing it — the payment-mode-aware cache
  prevents double-spend on repeated verdicts.
