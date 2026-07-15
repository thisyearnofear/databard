# DataBard Strategy: Data Communication Gap

## North Star

**DataBard solves the communication gap between data teams and everyone else.**

Data health monitoring tools (Monte Carlo, Bigeye, Soda, dbt tests) tell you *what's broken*. They don't tell the people who need to know. The insight exists in dashboards, logs, and test results — but it doesn't *land* with the exec, the PM, or the stakeholder who needs to act on it.

DataBard's real problem is not "data observability" (we'd lose to better-funded competitors). It's **data communication** — a category with no incumbent. Audio briefings are a new format for an old pain: "I built a report and nobody read it."

## The Three Problems, Ranked by GTM Urgency

### Problem 1: "My data team writes reports nobody reads" (the wedge)

Every data lead feels this pain. They spend hours building dashboards, writing weekly updates, creating Notion docs — and nobody opens them. The weekly digest podcast solves this directly: the report comes to you, in a format you can consume on your commute, and it's 2 minutes long.

**Why this converts:** You don't need to explain the problem. You play a 2-minute executive summary of a real schema and say "this is what your team gets every Monday." The reaction is immediate.

**Why this is defensible:** The synthesis is the moat. You can't read 47 rows aloud — you have to distill. That distillation, powered by LLMs + the analysis engine, is something traditional observability tools can't do.

### Problem 2: "I don't know my data health is bad until something breaks" (expansion)

The data observability problem. We have a version of this (health scores, alerts, trend narratives) but we're not the best at it. However, we have something the observability tools don't: **the trend narrative.** "Your health dropped 8 points because test coverage fell in the payments schema after the Friday deploy" is more useful than "anomaly detected in table X."

**Why this retains:** Once a team is getting weekly digests, alerts and trend narratives create a pull-back effect. Health dropped → alert fires → you check the dashboard → you hear what changed. The audio + dashboard combination is stickier than either alone.

### Problem 3: "I can't prove my data quality history to auditors" (niche)

The onchain attestation use case. Real but narrow. For most enterprises, this is "nice to have." For web3-native teams, it's a differentiator. Keep it for the Onchain persona, don't lead with it.

The claim is now backed by product, not just copy: every report's SHA-256 is written on-chain via the Memo program, and `/verify` recomputes the hash from the report and checks it against the memo — anyone can audit a report without trusting our servers.

## Competitive Positioning

| Positioning | Competitor | Our edge |
|---|---|---|
| "Data observability" | Monte Carlo, Bigeye, Soda, dbt tests | We lose — they're better funded, more mature |
| "Data communication" | Nobody | We own it — audio briefings are a new category |
| "Data catalog podcast" | Nobody (but novelty wears off) | The format is the wedge, not the product |

**The key insight:** We're not competing with observability tools. We're a communication layer that sits on top of any data source and makes findings consumable. The observability tools can be inputs to DataBard, not competitors.

## Persona Strategy

### Enterprise (default)
- **Who:** Data team leads at companies with 50+ tables
- **Pain:** "I spend hours building reports nobody reads"
- **Wedge:** Weekly executive briefing (2-min audio)
- **Expansion:** Alerts, trend narratives, team email delivery
- **Terminology:** Health score, test coverage, critical tables, downstream risk
- **Onchain:** Not mentioned. Enterprise data teams don't want Solana in their stack.

### Onchain (secondary)
- **Who:** Web3 protocol operators, DAO data teams
- **Pain:** "I need publicly verifiable protocol health"
- **Wedge:** Onchain attestation + `/verify` + leaderboard
- **Expansion:** Same analysis engine, different output emphasis
- **Terminology:** Subgraphs, indexers, entities, attestations
- **Onchain:** Core feature, not afterthought
- **Entry point:** `/?persona=onchain` opens the site in this persona (used for the Solana accelerator demo — see [`docs/DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md))

### Field-sales allocation (discovery hypothesis)
- **Who:** Field-sales leaders with fragmented account, activity, and commercial data; initial hypothesis: publishers selling to schools.
- **Pain:** "I do not know whether my best salespeople are assigned to the best opportunities, or where scarce field time will create the most revenue."
- **Wedge:** An evidence-backed allocation briefing: high-potential accounts that are under-covered, capacity mismatches, and recommended next actions.
- **Required proof:** Recommendations must connect to independent commercial outcomes such as orders, invoices, payments, credits, or renewals—not activity data alone.
- **Product boundary:** This is not a CRM replacement or a committed pivot. Validate it as a distinct vertical while preserving the data-health product.
- **Trust:** Start with scoped, read-only exports and transparent evidence trails; do not lead with zero-knowledge technology before a customer has a concrete privacy-preserving verification need.

See [`docs/FIELD_SALES_ALLOCATION.md`](FIELD_SALES_ALLOCATION.md) for the decision model, trust architecture, pilot, and non-goals.

## Product Principles

1. **Dashboard is the hero, audio is the button.** After analysis, land on the dashboard. Audio is a CTA on the dashboard, not the destination. This makes the product feel like an analyst that also talks — not a podcast that also analyzes.

2. **Synthesis over raw data.** The value is in the distillation. "Your payments table is stale, 8 dashboards are wrong, and here's what to do" is worth more than 47 rows of test results. Every output (audio, dashboard, alert) should be synthesized, not raw.

3. **Trend narratives are the moat.** Not just "health score is 72%" but "your health score dropped 8 points this week because test coverage fell in the payments schema after the Friday deploy." This is what LLMs are actually good at and traditional tools can't do.

4. **Onchain is a persona, not a pillar.** Solana attestation is valuable for the Onchain persona. Don't contaminate the enterprise pitch with crypto jargon. The `/onchain` page is a primitives showcase for those who care — not a core feature for everyone. The inverse also holds: for a Solana-native audience (accelerators, protocol teams), lead with the Onchain persona and the verification story — enterprise becomes the TAM-expansion slide, not the demo.

5. **Anthem is labs, not product.** Data-driven songs are a fun experiment. They don't serve the analysis-first positioning. Keep the code, move it to `/labs`, don't surface it in the main flow.

## What We're Not

- **Not a data observability platform.** We don't compete with Monte Carlo. We're a communication layer that can ingest observability data.
- **Not a data catalog.** We don't replace OpenMetadata or dbt. We read from them and make their findings consumable.
- **Not a podcast tool.** The audio is a format, not the product. The product is the analysis + synthesis.
- **Not a web3 product (for enterprise).** Onchain is a persona-specific feature, not a core pillar.

## Operating Principles (Paul Graham framework)

These are the rules we operate by. They're not features — they're disciplines.

### 1. Watch users use it

> *"Watch a user use your product. You'll learn more in 10 minutes than in a month of analytics."*

Analytics events tell us funnel steps. They don't tell us where someone got
confused, what they tried to click, or why they left. The highest-value thing
we can do before any demo or launch is sit with one person who has never seen
DataBard and watch them use it without explanation. Don't help. Just watch.

**Practice:** Before every demo, watch one person use the product cold. Record
the screen if possible. Note where they hesitate, what they misread, what they
try first. Those observations are the roadmap — not feature requests, not
competitor analysis, not accelerator feedback.

### 2. Get the first 10 users manually

> *"Get users manually. Go to them. Don't wait for them to come to you."*

The email capture forms on shared episodes, verify, leaderboard, and landing
page are passive — they wait for the user. The first 10 users come from us
going to them. We have 5 Solana protocol teams named in
[`docs/GTM.md`](GTM.md) with data already seeded and briefings ready to send.

**Practice:** Contact one protocol team per day. Send them a briefing on their
actual data. Ask: "Did this surface something you didn't already know?" The
answer to that question is the only validation that matters right now.

### 3. Be a user yourself

> *"The best startup ideas come from living in the future and noticing what's missing."*

DataBard exists because we felt the pain of data reports not being consumed.
That's the right origin. But the second-order question is: what's missing from
DataBard that we personally feel? Not what a roadmap says, not what a reviewer
wants — what do WE wish it did?

**Practice:** Use DataBard on our own data, every week, for a month. If we
won't use it, no one will. The frustration we feel is the roadmap. If we
haven't used it on our own data for a month, we're building a product for other
people without being a user ourselves — that's the biggest risk.

### 4. Know your number (default alive)

> *"The default state of a startup is dead. You have to fight to be alive."*

We know our cost-per-briefing ($0.80) and our price ($49/month per team). At
10 paying teams we're default alive. At 1 paying team we're losing $36/month
on fixed costs. That's fine — the first 10 users are manual, not paid. The
first paying team validates the price. The 10th paying team validates the
business. Full breakdown in [`docs/UNIT_ECONOMICS.md`](UNIT_ECONOMICS.md).

**Practice:** Update the unit economics doc when costs change (new TTS model,
new LLM provider, new infrastructure). The number should always be current.
If we don't know whether we're default alive, we're default dead.

### 5. The briefing is the steak; everything else is sizzle

> *"The initial product should be almost embarrassingly simple."*

DataBard has a wizard, a dashboard, a leaderboard, a market page, an escrow
program, attestation, verify, alerts, a roast page, clip sharing, badges, OG
images, Coral integration, email delivery, Stripe. That's not embarrassing.
That's impressive. But if the briefing isn't worth listening to, none of the
rest matters.

The one thing that if removed, the product would die: **the audio briefing +
the health score.** Everything else is a distribution mechanism or a trust
layer. In the demo, spend the most time on the briefing itself. The escrow and
the leaderboard are the sizzle. The briefing is the steak.

**Practice:** In every demo, the briefing gets the most airtime. The escrow
settlement is the climax, but the briefing is the product. If the reviewer
remembers one thing, it should be the moment Morgan said "your test coverage
is 23% and you have three PII columns with no owner" — not the program ID.

### 6. Have a price, even if it's wrong

> *"Don't be a sociopath about monetization, but do have a number."*

We charge $49/month per team. It might be wrong. It might be too low or too
high. But having a number forces us to think about unit economics, and it
forces the first paying user to make a real decision. "We'll figure it out
later" is not a strategy — it's an avoidance mechanism.

**Practice:** The price stays $49 until we have 10 paying teams. Then we
evaluate: are they all at 1 schema (too expensive) or 5+ schemas (too cheap)?
The first 10 payments are the price test, not a survey.

## See Also

- [`docs/GTM.md`](GTM.md) — Viral hooks, engagement loops, manual outreach target list
- [`docs/UNIT_ECONOMICS.md`](UNIT_ECONOMICS.md) — Cost-per-briefing, pricing, margin analysis
- [`docs/PLAN.md`](PLAN.md) — Development roadmap and phases
- [`docs/DATA_SOURCES_ARCHITECTURE.md`](DATA_SOURCES_ARCHITECTURE.md) — Tiered source architecture
- [`docs/DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md) — Solana accelerator demo: talk track, click path, preflight
- [`docs/FIELD_SALES_ALLOCATION.md`](FIELD_SALES_ALLOCATION.md) — Field-sales vertical discovery hypothesis
