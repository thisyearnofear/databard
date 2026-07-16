# DataBard — 5-Minute Pitch Script
## Solana Accelerator Demo Day

**Total time: 5 minutes (~700 words spoken)**
**Format: Slides → Demo video → Q&A**

---

## Slide 1: Title (10 seconds)

**Visual:** DataBard logo, tagline: "An AI analyst for your data estate"

**Speaker:**
> "DataBard is an AI analyst that turns data health into something people actually consume — a two-minute audio briefing. For teams that need public trust, every report is anchored on Solana."

---

## Slide 2: The Problem (50 seconds)

**Visual:** Three stats, large text:
- 61% of dashboards are never opened
- 2.3% are used for decisions
- 12% open rate on data quality reports

**Speaker:**
> "Data teams have an action problem, not a tooling problem. Monte Carlo, Bigeye, Soda — they all detect what's broken. But 61% of dashboards are never opened. Only 2.3% drive decisions. We spent 5 hours a week writing a data quality report that 12% of people opened."
>
> "The insight exists. The dashboards exist. The tests exist. What doesn't exist is synthesis and action. Nobody acts because nobody wants to read a 47-row test results table, and nobody connects the dots between 'test coverage dropped' and '8 downstream dashboards are now wrong.'"
>
> "This isn't a data observability problem — it's a data inaction problem. And in the agentic era, the answer isn't another dashboard. It's an analyst that synthesises and acts for you."

---

## Slide 3: The Solution (50 seconds)

**Visual:** DataBard dashboard screenshot + audio waveform side by side. Arrow showing the flow: Connect → Analyse → Synthesise → Act

**Speaker:**
> "DataBard is an AI data analyst. It connects to any data source — OpenMetadata, dbt, Coral, Dune, The Graph — computes health scores, and synthesises what it finds into trend narratives and recommended next steps."
>
> "The agent is the hero. Audio briefings, dashboards, alerts — those are all output formats of the same synthesis engine. You get a 2-minute briefing on your commute, drill into the dashboard when you need detail, and (next) the agent files the ticket and drafts the runbook for you."
>
> "The synthesis is the moat. You can't read 47 rows aloud — you have to distill. That distillation, powered by LLMs, is something observability tools can't do and generic AI assistants can't do without our data connectors and health-scoring engine."

---

## Slide 4: The Business (40 seconds)

**Visual:** Two columns:
- **The core product:** $49/month per team, up to 5 schemas, unlimited listeners
- **Unit economics:** $0.80/briefing, default alive at 10 teams

**Speaker:**
> "The business is straightforward. $49 a month per team, up to 5 schemas, unlimited listeners. Cost per briefing is about 80 cents — ElevenLabs TTS is 95% of variable cost. We're default alive at 10 paying teams."
>
> "The price is deliberately below the procurement threshold — no IT approval needed. The first 10 users come from us going to them manually. The first paying team validates the price. The 10th validates the business."

---

## Slide 5: The Demo (90 seconds — play recorded video)

**Visual:** [PLAY RECORDED DEMO VIDEO]

**Speaker (during video):**
> "Let me show you the product."

*(Video shows: landing → dashboard → fleet health chart → "what changed" narrative → play 20s of audio briefing → mint attestation → /verify green check → leaderboard)*

---

## Slide 6: Where Solana Fits (45 seconds)

**Visual:** Diagram showing: Report → SHA-256 hash → Solana Memo → /verify page → green check. Small text: "Optional — for teams that need public trust"

**Speaker:**
> "The core product works without Solana — it's a communication layer for data teams. But for a specific audience, public trust matters."
>
> "Web3 protocols make public claims about their infrastructure health. A protocol saying 'our data quality is 92' is marketing — unless it's verifiable. So we added an optional attestation layer: every report's SHA-256 is written to Solana via a Memo program transaction. Anyone can verify the hash against the report with one RPC call. About five ten-thousandths of a cent per attestation."
>
> "We also built an Anchor escrow program on devnet where data insights can settle through on-chain escrow — that's experimental, but the attestation layer is ready for mainnet today."
>
> "Solana isn't the reason DataBard exists. It's a trust layer for the subset of teams that need public verifiability — and it's the entry point into the web3 ecosystem."

---

## Slide 7: Distribution Built In (30 seconds)

**Visual:** Loop diagram: Briefing → Forward to Slack → Shared episode page → "Get this for your data" CTA → New user → Their briefing → Forward again

**Speaker:**
> "The product is its own distribution channel. Every shared episode is a mini-landing page with a 'Get this for your data' CTA. Every dashboard has an embeddable health badge. The success event — forwarding the Monday briefing to 20 stakeholders — IS the acquisition event. Usage and distribution are the same act."

---

## Slide 8: The Ask (15 seconds)

**Visual:** "What we need from the accelerator" + 3 bullets:
- Ecosystem intros to protocol teams (cold start the registry)
- Feedback on the escrow marketplace design
- Visibility for the first 10 paying teams

**Speaker:**
> "We need three things: ecosystem intros to protocol teams to cold-start the registry, feedback on the escrow marketplace, and visibility to land our first 10 paying teams."
>
> "DataBard. Data reports don't fail on accuracy — they fail on distribution to human attention. We built a report that travels."

---

## Timing Summary

| Slide | Time | Running |
|-------|------|---------|
| 1. Title | 10s | 0:10 |
| 2. Problem | 50s | 1:00 |
| 3. Solution | 50s | 1:50 |
| 4. Business | 40s | 2:30 |
| 5. Demo video | 90s | 4:00 |
| 6. Where Solana Fits | 45s | 4:45 |
| 7. Distribution | 30s | 5:15 |
| 8. The Ask | 15s | 5:30 |

**Total: ~5:30** — trim slide 6 or 7 if you need to hit 5:00 sharp.

---

## Key Phrases to Hit (memorize these)

1. **Opening:** "DataBard is an AI analyst that turns data health into something people actually consume"
2. **Problem:** "61% of dashboards are never opened. Only 2.3% drive decisions."
3. **Moat:** "The synthesis is the moat. You can't read 47 rows aloud — you have to distill."
4. **Solana (honest):** "The core product works without Solana. But for teams that need public trust, every report is anchored on-chain."
5. **Closing:** "Data reports don't fail on accuracy — they fail on distribution to human attention. We built a report that travels."

---

## What NOT to Say

- Don't say "AI podcast" — say "audio briefing" or "decision-ready briefing"
- Don't say "NFT" — say "Memo program hash commitment"
- Don't claim the escrow marketplace is production — say "devnet, experimental"
- Don't say "Solana is the trust layer that makes reports worth believing" — that's overclaiming. Say "Solana is a trust layer for teams that need public verifiability"
- Don't say "every report needs to be on-chain" — most don't. The attestation is optional.
- Don't say "auditors verify" beyond what /verify shows — let the product speak
- Don't lead with Solana — lead with the communication problem, Solana is slide 6
