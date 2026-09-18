# DataBard Strategy: Public Accounting for Ecosystems

*Rewritten 18 September 2026, supersedes the 2025 audio-wedge strategy. The old
doc described the wizard product at a time when audio briefings were the lead
offer. This one describes what DataBard actually is now: two front doors, one
engine, verifiability as the brand.*

## North Star

**DataBard turns public data into public accounting: reports people share and agents call — every finding dated, receipted, and checkable.**

Ecosystems run on claims. "We funded hundreds of builders." "Our program is the
most active." Those claims live in tweets and pitch decks; nobody publishes the
accounting. At the same time, a new class of customer has arrived — agents that
buy data services per call — and it has no reliable way to judge a service
before paying it.

DataBard answers both with one engine: read public data, compute the finding,
attach an evidence receipt, and publish the result where humans can share it
(public reports, commissioned editions) and where agents can call it (A2MCP
tools with x402 payment). Verifiability is not a feature of the product. It is
the product.

## The Two Front Doors

### Human front door — public reports and editions

- **Free previews**, computed from public data (Superteam Earn listings today;
  more datasets next). No wallet, no payment, full methodology included.
- **Commissioned editions**: pin a dated snapshot for $25 (PUSD, SOL, or USDC),
  with payment attribution and a durable permalink. One published edition per
  subject; republishing is a no-op, so nobody is ever double-charged.
- The subject shares the page because it is flattering *and verifiable* — the
  artifact distributes itself.
- The receipt makes every number checkable; `/verify` lets anyone audit a
  report without trusting our servers.

### Machine front door — agent tools

- **`databard_health_check`** (free) — the discovery driver. Listed on OKX.AI
  (approved September 2026) and reachable through the Monid catalog.
- **`databard_briefing`** ($1, x402 on X Layer) — full synthesis as a paid
  tool: two-voice script, audio, health score, recommended actions.
- **`databard_probe`** ($1) — the service-quality oracle: measures candidate
  agent services across six dimensions, returns a ranked verdict with a cost
  receipt and optional on-chain attestation.
- `/agents` is the human-readable front page for all of it; `/probe` demos the
  paid oracle with a free preview.

### One engine underneath

Deterministic where money and receipts are involved (public reports, editions,
probe metrics). LLM-assisted where narrative helps (briefings, the wizard). The
wizard and its two-voice audio briefings remain a **supporting surface** — the
way individuals connect their own data (dbt, catalogs, Dune, subgraphs,
DataHub, Monid) — but they are no longer the lead story.

## The Problem, Honestly Stated

1. **Ecosystems publish claims, not accounting.** Public data exists (Earn
   listings, on-chain activity), but nobody turns it into a dated, citable
   record. The closest alternative is a dashboard screenshot: unverifiable,
   undated, unattributed.
2. **Agents pay for services they can't evaluate.** Metered endpoints are
   proliferating (Monid alone lists 1,900+). There is payment infrastructure
   (x402) but no quality oracle — nothing that measures a service before you
   spend on it.
3. **Data teams still write reports nobody reads** (the original wedge). Real,
   still served by the wizard, but no longer the center of the business.

## Why Verifiability Is the Brand

- **Receipts over vibes.** Every report carries a SHA-256 evidence receipt over
  the canonical computation payload. We state its limits plainly: it proves
  integrity, not source truth; it does not authenticate an issuer.
- **Deterministic where it matters.** A third party can recompute a public
  report from the same source data and get the same numbers. Publishing pins
  the snapshot — a one-way door.
- **Honest labels, always.** Demos are labelled `demo: true`. Snapshot data is
  labelled. Unreachable sources degrade to labelled demos, never to silent
  failures. This discipline is already in the code; it is now codified here.
- A flattering page that can be *checked* is worth more than a flattering page
  that can't. That is what makes the media model below credible.

## Revenue Shapes (all product-shaped)

1. **Self-serve editions** (live): $25 one-off, zero-touch. Deterministic
   compute over cached public data means near-zero marginal cost.
2. **Per-call agent tools** (live): $1 briefings (~$0.65 margin after TTS),
   $1 probes. Real calls are already happening; volume is unproven.
3. **Sponsored editions** (hypothesis): a brand pays to be named on a trusted
   public artifact — adjacency to credibility, not custom labour.
4. **Editions over user datasets** (the unlock): point the engine at a Dune
   query, CSV, or API and it produces *their* accounting page. "Turn my data
   into a shareable, evidence-receipted narrative" is the thing nobody else
   does.

## Competitive Positioning

| Positioning | Competitor | Our edge |
|---|---|---|
| Public accounting / verifiable reports | Dashboard screenshots, ecosystem blogs | Nobody publishes dated, receipted, permalinked accounting |
| Agent-service quality oracle | Agent directories (list-only) | Probe *measures*; directories just list |
| Data observability | Monte Carlo, Bigeye, Soda | We don't compete — they monitor private estates; we publish public records |
| Data communication / briefings | Generic AI assistants | They don't connect to sources, don't compute findings, don't attach receipts |
| Not a podcast tool | — | Audio is one output of the synthesis layer, kept for the wizard |

## Product Principles

1. **Every claim checkable.** If a number appears on a DataBard page, its
   source, method, and receipt are reachable from that page. No exceptions.
2. **Deterministic where money changes hands.** LLM narrative is allowed where
   it helps a human; it is never load-bearing for a paid, receipted artifact.
3. **The finding is the steak.** The receipt, the evidence, the recommended
   next step. Themes, audio, OG cards, and animations are sizzle. In every
   demo, the finding gets the airtime.
4. **Generated, never crafted.** Every bespoke request is a parameter request.
   The `/earn` editions are the proof: built once for Superteam UK,
   parameterised so 593 sponsors self-serve the same artifact. Would it work
   for the next 100 users untouched? If not, it's consulting — decline.
5. **Two doors, one engine.** No feature may serve one door by forking the
   computation. If the agent tool and the report disagree, one of them is a
   bug.
6. **Honest labels over impressive demos.** A labelled demo beats a silent
   fabrication every time. The product already degrades this way; never regress
   it.

## Operating Principles (Paul Graham framework)

1. **Watch users use it.** Sit with one person opening an edition link cold.
   Note where they hesitate, what they try to click, what they misread. Those
   observations are the roadmap.
2. **Get the first 10 users manually.** Named Earn sponsors and protocol data
   teams. One a day. Send them their preview. Ask: "Did this surface something
   you didn't already know?"
3. **Be a user yourself.** Publish and share our own edition. Run Probe against
   services we'd actually pay. If we won't use it, no one will.
4. **Know your number.** Margins per revenue shape live in
   [`UNIT_ECONOMICS.md`](UNIT_ECONOMICS.md). Keep them current.
5. **The synthesis is the steak; everything else is sizzle.** The one thing
   that, if removed, kills the product: the finding plus its evidence. Guard
   the airtime it gets.
6. **Have a price, even if it's wrong.** $25 per edition, $1 per agent call.
   Prices are hypotheses; the first ten payments are the test, not a survey.

## What We're Not

- **Not a data observability platform.** We don't compete with Monte Carlo.
- **Not a dashboard.** Dashboards show numbers; we publish findings.
- **Not a podcast tool.** Audio is an output format, kept for the wizard.
- **Not a blockchain product.** Chains are settlement and verification rails,
  not the identity. The engine works without a wallet.
- **Not an agency.** Commissioned artifacts are generated by the engine, not
  crafted by us.
- **Not a media company that writes.** Every word on a report is generated from
  data or plainly labelled as copy.

## Why Now

1. **Public ecosystems produce accounting-grade data but publish no
   accounting.** Earn listings, grants, on-chain activity — the raw material
   for credible public reports finally exists in structured form.
2. **x402 and A2MCP made machine-payable services real in 2026.** Payment rails
   exist; quality measurement doesn't. DataBard is early, listed, and already
   taking real calls.
3. **LLMs made narrative cheap — which makes verifiable narrative scarce.** When
   anyone can generate a plausible story, the story you can *check* is the one
   worth paying for.

## See Also

- [`GTM.md`](GTM.md) — distribution loops, hooks, outreach
- [`UNIT_ECONOMICS.md`](UNIT_ECONOMICS.md) — margins per revenue shape
- [`PLAN.md`](PLAN.md) — roadmap and phase gates
- [`DATA_SOURCES_ARCHITECTURE.md`](DATA_SOURCES_ARCHITECTURE.md) — the adapter set
- [`OPERATIONS.md`](OPERATIONS.md) — prod environment and stay-alive
