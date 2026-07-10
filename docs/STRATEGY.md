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
- **Wedge:** Onchain attestation + leaderboard
- **Expansion:** Same analysis engine, different output emphasis
- **Terminology:** Subgraphs, indexers, entities, attestations
- **Onchain:** Core feature, not afterthought

## Product Principles

1. **Dashboard is the hero, audio is the button.** After analysis, land on the dashboard. Audio is a CTA on the dashboard, not the destination. This makes the product feel like an analyst that also talks — not a podcast that also analyzes.

2. **Synthesis over raw data.** The value is in the distillation. "Your payments table is stale, 8 dashboards are wrong, and here's what to do" is worth more than 47 rows of test results. Every output (audio, dashboard, alert) should be synthesized, not raw.

3. **Trend narratives are the moat.** Not just "health score is 72%" but "your health score dropped 8 points this week because test coverage fell in the payments schema after the Friday deploy." This is what LLMs are actually good at and traditional tools can't do.

4. **Onchain is a persona, not a pillar.** Solana attestation is valuable for the Onchain persona. Don't contaminate the enterprise pitch with crypto jargon. The `/onchain` page is a primitives showcase for those who care — not a core feature for everyone.

5. **Anthem is labs, not product.** Data-driven songs are a fun experiment. They don't serve the analysis-first positioning. Keep the code, move it to `/labs`, don't surface it in the main flow.

## What We're Not

- **Not a data observability platform.** We don't compete with Monte Carlo. We're a communication layer that can ingest observability data.
- **Not a data catalog.** We don't replace OpenMetadata or dbt. We read from them and make their findings consumable.
- **Not a podcast tool.** The audio is a format, not the product. The product is the analysis + synthesis.
- **Not a web3 product (for enterprise).** Onchain is a persona-specific feature, not a core pillar.

## See Also

- [`docs/GTM.md`](GTM.md) — Viral hooks, engagement loops, user interview plan
- [`docs/PLAN.md`](PLAN.md) — Development roadmap and phases
- [`docs/DATA_SOURCES_ARCHITECTURE.md`](DATA_SOURCES_ARCHITECTURE.md) — Tiered source architecture
