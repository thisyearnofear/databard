# DataBard Unit Economics

## The one number

**It costs ~$0.80 to generate one weekly briefing.**
**We charge $49/month per team.**
**Margin: ~$44/month per team (at 4 briefings/month, 1 schema).**

---

## Cost breakdown per weekly briefing

| Component | Service | Model/Tier | Usage | Cost |
|-----------|---------|------------|-------|------|
| **Script generation** | OpenAI API | GPT-4o-mini | ~5,000 tokens (1,200 system + 3,000 input + 800 output) | $0.001 |
| **Voice synthesis** | ElevenLabs | eleven_multilingual_v2 | ~2,000 characters speech + 5 SFX generations | $0.63–$1.02 |
| **Solana attestation** | Solana RPC | Memo program (mainnet) | 1 transaction | $0.001–$0.05 |
| **Email delivery** | Resend | Pro plan | 1 email | $0.001 |
| **Total per briefing** | | | | **$0.64–$1.07** |

**TTS is 95% of variable cost.** Everything else is negligible.

### Why TTS dominates

ElevenLabs charges $0.10 per 1,000 characters for speech and $0.12 per sound effect generation. A typical 2-minute briefing has ~2,000 characters of speech ($0.20) and 5 sound effects ($0.60). The SFX are the surprise cost driver — each intro, outro, and transition is a separate API call.

### Cost reduction levers

1. **Switch to ElevenLabs Flash model** — $0.05 per 1,000 chars (50% cheaper), slightly lower quality
2. **Reduce SFX calls** — batch transitions or use pre-rendered assets instead of per-segment generation
3. **Cache aggressively** — scripts cached 1hr, audio cached 24hr. Same schema = $0 marginal cost on cache hit
4. **Use Azure OpenAI credits** — moves the $0.001 LLM cost to free credits (negligible but clean)

---

## Monthly cost per team

| Schemas tracked | Briefings/month | Variable cost | At $49/month | Margin |
|-----------------|-----------------|---------------|---------------|--------|
| 1 | 4.3 | $3.40 | $49 | $45.60 |
| 3 | 13 | $10.40 | $49 | $38.60 |
| 5 | 21.5 | $17.20 | $49 | $31.80 |
| 10 | 43 | $34.40 | $49 | $14.60 |

**Break-even at 10 schemas per team.** Most teams will track 3–5.

---

## Fixed monthly costs

| Item | Cost | Notes |
|------|------|-------|
| VPS (Hetzner) | $5–10 | Single server, PM2, Next.js + Coral sidecar |
| ElevenLabs Starter | $5 | Required for API access |
| Resend Pro | $20 | 50,000 emails/month (optional — free tier covers 3,000) |
| Domain | $1 | persidian.com |
| **Total fixed** | **$11–36** | |

At 10 paying teams ($490/month revenue), fixed costs are covered with ~$450 margin.

---

## Pricing

### Entry price: $49/month per team

- Below the "need to ask my manager" threshold for most data teams
- Covers up to 5 schemas, unlimited listeners
- Includes on-chain attestation (Solana mainnet)
- Includes weekly email digest delivery
- Includes embeddable health badge

### Why $49, not $99 or $29

- **$29** — too close to per-user SaaS tools (Slack, Notion). DataBard is a team tool, not a per-seat tool. Pricing per-seat would penalize sharing, which is our distribution loop.
- **$49** — comparable to a single Datadog host ($15–35) but delivers more decision-relevant value. Below the procurement threshold at most companies. High enough to signal "this is a real tool" without being expensive enough to require a committee.
- **$99** — would be the right price for a team tracking 10+ schemas with custom alerts. Save this for a Pro tier. Don't lead with it.

### What's free

- Demo (no signup)
- Single ad-hoc briefing generation
- Shared episode viewing
- Leaderboard browsing
- Verify page (public good)
- Health badge (embeddable, free forever — it's a distribution surface)

### What's paid

- Scheduled weekly digests (the retention loop)
- Multiple schemas
- Custom alerts
- On-chain attestation (mainnet)
- Team management (multiple recipients)

---

## The PG question: "Are you default alive?"

**Yes, at 10 paying teams.**

- 10 teams × $49 = $490/month revenue
- Variable costs: ~$100/month (assuming 3 schemas avg, 13 briefings/month each)
- Fixed costs: ~$36/month
- **Net: ~$354/month positive**

At 1 paying team, you're losing ~$36/month on fixed costs. That's fine — the first 10 users are manual, not paid. The first paying team validates the price. The 10th paying team validates the business.

---

## What we don't know yet

1. **How many schemas does a real team track?** Our guess is 3–5. The first 10 conversations will tell us.
2. **Is the briefing worth $49/month?** We won't know until someone pays. The free tier removes price as the barrier; the paid tier tests value.
3. **Does TTS quality matter?** If Flash model is good enough, costs drop 50%. A/B test after 10 users.
4. **What's the retention curve?** If teams churn after 2 months, the LTV doesn't justify the CAC. We need 3 months of data from real users.

---

## Method

These costs are calculated from the actual codebase:
- `src/lib/script-generator.ts` — LLM call, GPT-4o-mini, ~5K tokens
- `src/lib/audio-engine.ts` — ElevenLabs API, eleven_multilingual_v2, ~2K chars + 5 SFX
- `src/app/api/onchain/mint-solana/route.ts` — Solana Memo transaction
- `src/lib/notifications.ts` — Resend email delivery

Pricing is a hypothesis. The first 10 paying teams are the test.
