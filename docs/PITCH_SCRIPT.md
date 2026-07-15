# DataBard — 5-Minute Pitch Script
## Solana Accelerator Demo Day

**Total time: 5 minutes (~700 words spoken)**
**Format: Slides → Demo video → Q&A**

---

## Slide 1: Title (10 seconds)

**Visual:** DataBard logo, tagline: "An AI analyst for your data estate"

**Speaker:**
> "DataBard is an AI analyst that turns data health into something people actually consume — a two-minute audio briefing, anchored on Solana, so protocol health is publicly verifiable, not just claimed."

---

## Slide 2: The Problem (45 seconds)

**Visual:** Three stats, large text:
- 61% of dashboards are never opened
- 2.3% are used for decisions
- 12% open rate on data quality reports

**Speaker:**
> "Data teams have a communication problem, not a tooling problem. Monte Carlo, Bigeye, Soda — they all detect what's broken. But 61% of dashboards are never opened. Only 2.3% drive decisions. We spent 5 hours a week writing a data quality report that 12% of people opened."
>
> "The insight exists. The dashboards exist. The tests exist. What doesn't exist is consumption. Nobody listens because nobody wants to read a 47-row test results table."
>
> "This isn't a data observability problem — it's a data communication problem. And there's no incumbent in that category."

---

## Slide 3: The Solution (45 seconds)

**Visual:** DataBard dashboard screenshot + audio waveform side by side. Arrow showing the flow: Connect → Analyze → Synthesize → Deliver

**Speaker:**
> "DataBard connects to any data catalog — OpenMetadata, dbt, Coral, Dune, The Graph — computes health scores, and synthesizes a two-minute podcast briefing. Two AI hosts walk you through what changed, what's broken, and what to fix first."
>
> "The dashboard is the hero. Audio is a button on the dashboard. You get the executive summary in 2 minutes on your commute, then drill into the dashboard when you need the detail."
>
> "The synthesis is the moat. You can't read 47 rows aloud — you have to distill. That distillation, powered by LLMs, is something observability tools can't do."

---

## Slide 4: Why Solana (60 seconds)

**Visual:** Diagram showing: Report → SHA-256 hash → Solana Memo → /verify page → green check

**Speaker:**
> "For web3 protocols, health claims are public claims. A protocol saying 'our data quality is 92' is marketing — unless it's verifiable."
>
> "Every DataBard report is attested on Solana via a Memo program transaction. The SHA-256 of the report is written on-chain. Anyone can verify the hash against the report without trusting our servers — one RPC call, zero contract risk, costs about five ten-thousandths of a cent per attestation."
>
> "We also built an on-chain escrow marketplace on Anchor — devnet now — where data insights settle through trust-minimized escrow. Seller commits a deliverable hash, buyer releases funds, the whole lifecycle is on-chain."
>
> "Solana isn't a bolt-on. It's the trust layer that makes the reports worth believing."

---

## Slide 5: The Demo (90 seconds — play recorded video)

**Visual:** [PLAY RECORDED DEMO VIDEO]

**Speaker (during video):**
> "Let me show you the product."

*(Video shows: Onchain persona landing → dashboard → fleet health chart → "what changed" narrative → play 20s of audio briefing → mint attestation → /verify green check → leaderboard)*

---

## Slide 6: Market & Business Model (45 seconds)

**Visual:** Two columns:
- **Web3 wedge:** Protocol teams need verifiable health → leaderboard as public registry
- **Enterprise TAM:** Every data team with 50+ tables → $49/month per team

**Speaker:**
> "The wedge is web3 protocols. They already produce health metrics, they need them verifiable, and the leaderboard is a public registry they want to be on. Their marketing is our distribution."
>
> "The expansion market is every data team with 50+ tables. Same engine, different output. $49 a month per team, up to 5 schemas, unlimited listeners. Cost per briefing is about 80 cents — ElevenLabs TTS is 95% of variable cost."
>
> "We're default alive at 10 paying teams. The price is deliberately below the procurement threshold — no IT approval needed."

---

## Slide 7: Distribution Built In (30 seconds)

**Visual:** Loop diagram: Briefing → Forward to Slack → Shared episode page → "Get this for your data" CTA → New user → Their briefing → Forward again

**Speaker:**
> "The product is its own distribution channel. Every shared episode is a mini-landing page with a 'Get this for your data' CTA. Every dashboard has an embeddable health badge. Every on-chain attestation is a public artifact."
>
> "The success event — forwarding the Monday briefing to 20 stakeholders — IS the acquisition event. Usage and distribution are the same act."

---

## Slide 8: The Ask (15 seconds)

**Visual:** "What we need from the accelerator" + 3 bullets:
- Ecosystem intros to protocol teams (cold start the registry)
- Feedback on the escrow marketplace design
- Visibility for the first 10 paying teams

**Speaker:**
> "We need three things from this accelerator: ecosystem intros to protocol teams to cold-start the registry, feedback on the escrow marketplace, and visibility to land our first 10 paying teams."
>
> "DataBard. Data reports don't fail on accuracy — they fail on distribution to human attention. We built a report that travels."

---

## Timing Summary

| Slide | Time | Running |
|-------|------|---------|
| 1. Title | 10s | 0:10 |
| 2. Problem | 45s | 0:55 |
| 3. Solution | 45s | 1:40 |
| 4. Why Solana | 60s | 2:40 |
| 5. Demo video | 90s | 4:10 |
| 6. Market & Model | 45s | 4:55 |
| 7. Distribution | 30s | 5:25 |
| 8. The Ask | 15s | 5:40 |

**Total: ~5:25** — leaves buffer for transitions. Trim slide 6 or 7 if you need to hit 5:00 sharp.

---

## Key Phrases to Hit (memorize these)

1. **Opening:** "DataBard is an AI analyst that turns data health into something people actually consume"
2. **Problem:** "61% of dashboards are never opened. Only 2.3% drive decisions."
3. **Moat:** "The synthesis is the moat. You can't read 47 rows aloud — you have to distill."
4. **Solana:** "Every report is attested on Solana. Anyone can verify the hash without trusting our servers."
5. **Closing:** "Data reports don't fail on accuracy — they fail on distribution to human attention. We built a report that travels."

---

## What NOT to Say

- Don't say "AI podcast" — say "audio briefing" or "decision-ready briefing"
- Don't say "NFT" — say "Memo program hash commitment"
- Don't claim the escrow marketplace is on mainnet — say "devnet, mainnet is a config flip"
- Don't lead with enterprise — lead with the Solana/web3 angle, enterprise is the expansion
- Don't say "auditors verify" beyond what /verify shows — let the product speak
