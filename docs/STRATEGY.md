# DataBard Strategy: The AI Data Analyst That Acts

## North Star

**DataBard is an AI data analyst that monitors your data estate, synthesises what it finds, and acts on it.**

Data health monitoring tools (Monte Carlo, Bigeye, Soda, dbt tests) tell you *what's broken*. They don't tell the people who need to know, and they don't do anything about it. The insight exists in dashboards, logs, and test results — but it doesn't *land* with the exec, the PM, or the stakeholder who needs to act on it. And nobody files the ticket, pings the on-call, or drafts the runbook.

DataBard's real problem is not "data observability" (we'd lose to better-funded competitors). It's not even "data communication" alone — that's a symptom. The real problem is **data inaction**: the gap between knowing something is broken and doing something about it. Audio briefings were our first output format. The agent layer — synthesis, trend narratives, recommended next steps, and the ability to act on them — is the product.

## The Problem, Quantified

The pain is not a feeling. It's a number. Several numbers, actually:

| Statistic | Source | What it means |
|-----------|--------|---------------|
| **61% of dashboards are never opened in 6 months** | Dashboard audit (1,847 dashboards), Medium 2024 | The majority of data work is invisible. Teams build dashboards that literally never get viewed. |
| **Only 2.3% of dashboards are used for decisions** | Same audit (43 of 1,847) | Even when dashboards are opened, almost none drive action. The other 97.7% are decoration. |
| **54% of teams say reporting has inefficiencies** | Databox Time to Insight survey | Over half of teams know their reporting process is broken. |
| **11.2 hours/month per client on manual reporting** | AgencyAnalytics 2025 State of Agency Reporting | For agencies alone, reporting is a full-time job that produces no strategy. |
| **12% open rate on a data quality report** | Founder confession (DataBard origin) | We spent 5 hours/week writing a report that 12% of people opened. That's why DataBard exists. |

### What these numbers say

The problem isn't that data tools can't detect issues. The problem is that the
findings don't reach the people who need to act on them. The data exists. The
dashboards exist. The tests exist. What doesn't exist is **consumption**.

DataBard doesn't compete with observability tools — it competes with the
status quo of "I know something is broken and I'm still not doing anything
about it." The agent layer is what closes the gap, because:

1. **Synthesis gets acted on.** "Your health dropped 8 points because test
   coverage fell in payments after Friday's deploy, and here's what to do"
   gets acted on. "47 rows of test results" gets skimmed. The synthesis —
   not the format — is what drives action.
2. **Audio gets consumed.** 12% open rate on a report vs. a 2-minute briefing
   you can listen to on your commute. Audio is one output format that solves
   the consumption problem. It's not the only one — dashboards, alerts,
   tickets, and emails are others — but it's the one nobody else offers.
3. **Action is the differentiator.** An analyst that tells you something is
   broken is a dashboard. An analyst that tells you, explains why, recommends
   a fix, and files the ticket is an agent. The gap between informing and
   acting is where DataBard differentiates.
4. **Distribution is built in.** Shared episodes, embeddable badges, on-chain
   attestations — every artifact is a distribution surface. The report
   travels; it doesn't sit in a dashboard graveyard.

### Where these numbers appear in the product

The landing page shows three of these statistics (61%, 2.3%, 12%) as a
quantified problem section before any solution copy. The roast page uses
specific findings ("test coverage at 23%?") as emotional hooks. The dashboard
shows the live cost of the problem via `costHighlights()` — "3 tests failing
silently, cascading to 8 downstream tables."

The pain is not a claim. It's a number on the landing page.

## The Three Problems, Ranked by GTM Urgency

### Problem 1: "My data team writes reports nobody reads" (the wedge)

Every data lead feels this pain. They spend hours building dashboards, writing weekly updates, creating Notion docs — and nobody opens them. The weekly digest podcast solves this directly: the report comes to you, in a format you can consume on your commute, and it's 2 minutes long.

**Why this converts:** You don't need to explain the problem. You play a 2-minute executive summary of a real schema and say "this is what your team gets every Monday." The reaction is immediate.

**Why this is defensible:** The synthesis is the moat. You can't read 47 rows aloud — you have to distill. That distillation, powered by LLMs + the analysis engine, is something traditional observability tools can't do.

### Problem 2: "I don't know my data health is bad until something breaks" (expansion)

The data observability problem. We have a version of this (health scores, alerts, trend narratives) but we're not the best at it. However, we have something the observability tools don't: **the trend narrative.** "Your health dropped 8 points because test coverage fell in the payments schema after the Friday deploy" is more useful than "anomaly detected in table X."

**Why this retains:** Once a team is getting weekly digests, alerts and trend narratives create a pull-back effect. Health dropped → alert fires → you check the dashboard → you hear what changed. The audio + dashboard combination is stickier than either alone.

### Problem 3: "I can't prove my data quality history publicly" (niche)

The onchain attestation use case. Real but narrow. For most enterprises, this is "nice to have." For web3-native teams, it's a differentiator. Keep it for the Onchain persona, don't lead with it.

The claim is now backed by product, not just copy: every report's SHA-256 is written on-chain via the Memo program, and `/verify` recomputes the hash from the report and checks it against the memo — anyone can audit a report without trusting our servers.

## Competitive Positioning

| Positioning | Competitor | Our edge |
|---|---|---|
| "Data observability" | Monte Carlo, Bigeye, Soda, dbt tests | We lose — they're better funded, more mature |
| "Data communication" | Nobody | We own it — but communication alone is a symptom, not the disease |
| "AI data analyst" | Generic AI assistants (ChatGPT, Copilot) | They don't connect to your data estate, don't compute health scores, don't produce trend narratives, and don't act with context |
| "Data agent" | Emerging (too early to name) | First-mover with a working product, real data connectors (Coral, OpenMetadata, dbt, Dune), and a proven output format (audio briefings) |

**The key insight:** We're not competing with observability tools. We're not
just a communication layer. We're an **AI analyst** that sits on top of any
data source, synthesises what it finds into trend narratives and recommended
actions, and delivers those through multiple channels — audio briefings,
dashboards, alerts, and (next) automated actions like filing tickets and
drafting runbooks. The observability tools can be inputs to DataBard, not
competitors. The generic AI assistants don't have our data connectors, our
health-scoring engine, or our synthesis layer.

## Workspace Strategy

The product now presents this split as workspaces, not as separate products. Both workspaces use the same briefing engine, health scoring, trend narratives, and dashboard composition. The difference is disclosure: Teams hides crypto mechanics by default; Protocols exposes attestation, verification, and registry surfaces.

### Teams (default)
- **Who:** Data team leads at companies with 50+ tables
- **Pain:** "I spend hours building reports nobody reads"
- **Wedge:** Weekly executive briefing (2-min audio)
- **Expansion:** Alerts, trend narratives, team email delivery
- **Terminology:** Health score, test coverage, critical tables, downstream risk
- **Onchain:** Not mentioned. Enterprise data teams don't want Solana in their stack.
- **Entry point:** `/` and `/protocol` default to Teams. Wallet providers and on-chain navigation are not mounted in this workspace.

### Protocols (secondary)
- **Who:** Web3 protocol operators, DAO data teams
- **Pain:** "I need publicly verifiable protocol health"
- **Wedge:** Onchain attestation + `/verify` + leaderboard/explorer
- **Expansion:** Same analysis engine, different output emphasis
- **Terminology:** Subgraphs, indexers, entities, attestations
- **Onchain:** Core feature, not afterthought
- **Entry point:** `/?workspace=protocols` or `/protocol?workspace=protocols` opens the Protocols workspace. Legacy `?persona=onchain` links still map to this mode for compatibility.

### Presentation Discipline

The briefing engine is one product. Its presentation must earn trust with each
audience without splitting the underlying experience.

| Shared core | Teams | Protocols |
|---|---|---|
| Decision flow | Health, change, impact, recommended next step | The same, plus evidence and verification |
| Live analysis | "Initial assessment" and "What needs attention" | "Live protocol briefing" and "Protocol signal" |
| Audio | Optional executive explanation | Optional briefing with an attestable record |
| Trust surface | Read-only access, data handling clarity, source provenance | Attestation, wallet, and public verification |

**Rule:** Teams gets confidence and clarity. Protocols gets confidence,
clarity, and proof. Do not introduce wallet, attestation, or crypto language
to Teams. Do not make Protocols navigate a different analytical model. The
distinction is disclosure and trust context, not a separate product.

### Field-sales allocation (discovery hypothesis)
- **Who:** Field-sales leaders with fragmented account, activity, and commercial data; initial hypothesis: publishers selling to schools.
- **Pain:** "I do not know whether my best salespeople are assigned to the best opportunities, or where scarce field time will create the most revenue."
- **Wedge:** An evidence-backed allocation briefing: high-potential accounts that are under-covered, capacity mismatches, and recommended next actions.
- **Required proof:** Recommendations must connect to independent commercial outcomes such as orders, invoices, payments, credits, or renewals—not activity data alone.
- **Product boundary:** This is not a CRM replacement or a committed pivot. Validate it as a distinct vertical while preserving the data-health product.
- **Trust:** Start with scoped, read-only exports and transparent evidence trails; do not lead with zero-knowledge technology before a customer has a concrete privacy-preserving verification need.

See [`docs/FIELD_SALES_ALLOCATION.md`](FIELD_SALES_ALLOCATION.md) for the decision model, trust architecture, pilot, and non-goals.

## Product Principles

1. **The agent is the hero. Audio, dashboards, alerts, and actions are all outputs.** DataBard is an AI analyst that synthesises what it finds and acts on it. The dashboard is where you see the synthesis. The audio briefing is where you hear it. The alert is where it finds you. The ticket is where it acts. No single output format is the product — the synthesis engine behind all of them is. This makes the product feel like an analyst that works for you, not a podcast that also analyses.

2. **Synthesis over raw data.** The value is in the distillation. "Your payments table is stale, 8 dashboards are wrong, and here's what to do" is worth more than 47 rows of test results. Every output (audio, dashboard, alert, ticket) should be synthesised, not raw.

3. **Trend narratives are the moat.** Not just "health score is 72%" but "your health score dropped 8 points this week because test coverage fell in the payments schema after the Friday deploy." This is what LLMs are actually good at and traditional tools can't do. It's also what separates an analyst from a dashboard — an analyst explains *why*, not just *what*.

4. **From informing to acting.** The current product informs: it tells you what's broken and recommends a next step. The agentic evolution acts: it files the ticket, pings the on-call, drafts the runbook, and then briefs you on what it did. The gap between informing and acting is the differentiation. Build toward closing it, one action at a time.

5. **Protocols is a workspace, not a pillar.** Solana attestation is valuable for Protocols. Don't contaminate the Teams pitch with crypto jargon. The `/onchain` page is a primitives showcase for those who care, not a core feature for everyone. The inverse also holds: for a Solana-native audience, open the Protocols workspace and show verification as the trust layer, while making clear the same engine serves Teams.

6. **Anthem is labs, not product.** Data-driven songs are a fun experiment. They don't serve the analyst positioning. Keep the code, move it to `/labs`, don't surface it in the main flow.

## What We're Not

- **Not a data observability platform.** We don't compete with Monte Carlo. We're an AI analyst that can ingest observability data and act on it.
- **Not a data catalog.** We don't replace OpenMetadata or dbt. We read from them and make their findings actionable.
- **Not a podcast tool.** Audio is one output format, not the product. The product is the synthesis engine + the agent layer.
- **Not a generic AI assistant.** ChatGPT doesn't connect to your data estate, doesn't compute health scores, and doesn't produce trend narratives. We do.
- **Not a web3 product for Teams.** Onchain is a workspace-specific feature, not a core pillar.

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

### 5. The synthesis is the steak; everything else is sizzle

> *"The initial product should be almost embarrassingly simple."*

DataBard has a wizard, a dashboard, a leaderboard, a market page, an escrow
program, attestation, verify, alerts, a roast page, clip sharing, badges, OG
images, Coral integration, email delivery, Stripe. That's not embarrassing.
That's impressive. But if the synthesis isn't worth acting on, none of the
rest matters.

The one thing that if removed, the product would die: **the trend narrative +
the recommended next step.** That's the synthesis engine. The audio briefing
is the most distinctive *output* of that engine — it's what nobody else
offers — but it's an output, not the engine itself. The dashboard is another
output. The alert is another. The agent action (when we build it) will be
another. In the demo, spend the most time on the synthesis itself — the
moment Morgan says "your test coverage is 23% and you have three PII columns
with no owner" is the steak. The escrow, the leaderboard, even the audio
player are sizzle.

**Practice:** In every demo, the synthesis gets the most airtime. The audio
is the proof that the synthesis is real and consumable. The escrow settlement
is the climax, but the synthesis is the product. If the reviewer remembers
one thing, it should be the trend narrative — not the program ID, not the
voice model, not the leaderboard rank.

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
