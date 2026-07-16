# DataBard GTM: Viral Hooks, Engagement Loops, and User Interviews

## North Star

**DataBard is an AI data analyst that synthesises your data health and acts on it.** The synthesis engine is the product. Audio briefings are the wedge — the output format nobody else offers. The trend narrative is the moat. The shared episode link is the viral surface. The agent layer — informing today, acting tomorrow — is the differentiation.

---

## The Engagement Loop

```
ATTENTION
  │
  ├─ Social post: "AI roasted my database" (shareable clip)
  ├─ Colleague forwards Slack link to shared episode
  ├─ Blog post: "We replaced our weekly data report with a podcast"
  │
  ▼
CONVERSION (first "wow" moment)
  │
  ├─ Demo: lands on a live dashboard — what changed, downstream risk — with the audio briefing one click away (zero friction)
  ├─ Connects own data → sees health score → hears personal analysis
  ├─ "Roast my data" emotional trigger → shares result
  │
  ▼
RETENTION (habit formation)
  │
  ├─ Sets up weekly digest (Monday morning briefing)
  ├─ Alert fires when health drops → comes back to dashboard
  ├─ Trend narrative: "what changed?" → curiosity pull
  ├─ Team forwards digest in Slack → social accountability
  │
  ▼
VIRAL (each retention cycle creates new attention)
  │
  ├─ Shared episode link in Slack → 5-20 colleagues click
  ├─ Health score badge in README / team page
  ├─ "Share this moment" clip → social media
  ├─ Weekly digest email forwarded to stakeholders
  │
  ▼
  (loops back to ATTENTION)
```

---

## Viral Hooks

### Hook 1: "Hear your data talk" (the wow moment)

The first time someone hears two AI hosts discussing their database is genuinely surprising. It's the kind of thing you screen-record and post on Twitter.

**How to weaponize:**
- The demo is zero-friction and already works. But the demo analyzes a *sample* schema. The real viral moment is when someone connects *their own* data and hears Morgan say "your test coverage is 23% and you have three PII columns with no owner." That's personal, surprising, and slightly embarrassing — which makes it shareable.
- **"Share this moment" button** on the episode player that creates a 15-second audio clip of the most critical segment (Morgan's harshest call-out). People share clips, not full episodes.
- **The "roast my data" framing.** Position the demo as "let AI roast your data quality." This is more shareable than "AI analyst for your data estate." Same product, different emotional trigger.

### Hook 2: The health score as a status symbol

"Our data health score is 87" is a metric people want to share and compare. It's like a credit score for your data estate.

**How to weaponize:**
- The leaderboard already exists for web3. Extend the concept: let teams share their health score publicly (opt-in) with a badge. "DataBard Health Score: 87/100" in a README or team page.
- **Weekly health score email.** Every Monday, the team lead gets an email: "Your data health score this week: 82 (↓3 from last week). Listen to the 2-minute briefing →" The score creates anxiety/curiosity; the audio satisfies it.
- **Benchmarking.** "Your health score is 82. The average for teams your size is 71. You're in the top quartile." Comparison drives engagement.

### Hook 3: The forwarded Slack message (the distribution loop)

This is the most important retention-to-viral loop. When a data lead sets up a weekly digest, they forward it to their team in Slack. Every forward is a touchpoint for 5-20 people.

**How to weaponize:**
- **Make the shared episode page the best possible first impression.** When a colleague clicks the Slack link, they should see the dashboard with health scores, not just an audio player. The dashboard is the hook; the audio is the payoff.
- **Add "Get this for your data" CTA on every shared episode page.** Right now shared episodes don't have a strong conversion path. Add a banner: "This is DataBard — get weekly audio briefings for your own data. Connect →"
- **Team-level sharing.** Let the data lead add email recipients to the weekly digest. Each recipient gets the episode link + a 1-line summary. This is organic distribution to exactly the right audience (other people who care about data health).

---

## Loop Status (all previously-missing pieces shipped)

### Attention → Conversion
- The demo is zero-friction and dashboard-first: it seeds deterministic data and lands on /protocol with the briefing one click away ✓
- The landing page tells the story ✓
- "Share this moment" clip feature (15-second highlight + shareable link) ✓
- "Roast my data" framing lives at `/roast` and in the footer ✓

### Conversion → Retention
- After generation (and the demo), we land on the dashboard ✓
- "Want this every Monday?" one-click schedule prompt on the dashboard, pre-filled schema ✓
- Email delivery for scheduled digests ✓
- Verification loop: every on-chain record links to `/verify`, which recomputes the report hash against the memo — the trust surface that makes attestation worth returning to ✓

### Retention → Viral
- Shared episode links exist, with a "Get this for your data" CTA on `/episode/[id]` ✓
- Health score badge (embeddable SVG, `/api/badge/[schema]`) ✓
- Team email recipients for scheduled digests ✓

**What's genuinely still missing:** benchmarking ("your score vs. teams your size"), A/B testing the CTA order, and real funnel numbers — see Phase 7 in [`docs/PLAN.md`](PLAN.md).

---

## User Interview Plan

### Goal
Validate (or invalidate) the repositioning before investing more in building. We changed the landing page, default persona, and pillar messaging on assumption. Before building anything else, talk to 5 data team leads.

### Who to interview
- 5 data team leads at companies with 50+ tables
- Mix of dbt users, OpenMetadata users, and "we just use Slack" users
- Not current DataBard users — we want fresh reactions

### Interview script

**1. Setup (2 min)**
- "Tell me about your data team. How many people, what tools do you use?"
- "Walk me through your weekly data quality workflow."

**2. Pain discovery (5 min)**
- "When was the last time you reported data quality to leadership? How did you do it?"
- "Does your exec team read your dashboards? What about your PM?"
- "What's the hardest part about communicating data health to non-data people?"

**3. Show the product (5 min)**
- Show the landing page. Ask: "What does this product do? Would you use it?"
- Play the demo episode (2-min executive summary). Watch their reaction.
- Show the dashboard with trend narratives. Ask: "Is this useful? What's missing?"

**4. Format preference (3 min)**
- "Would you rather get a 2-minute audio briefing or a 15-minute podcast?"
- "Would you forward this to your team in Slack? Why or why not?"
- "Would you set this up as a weekly thing? What would stop you?"

**5. Pricing & willingness to pay (2 min)**
- "Would you pay $29/month for weekly digests + alerts + email delivery?"
- "What would make this a no-brainer for your team?"

**6. Onchain (1 min)**
- "Does the Solana attestation feature matter to you? Why or why not?"
- (Only for web3 leads: "Would you mint your health reports on-chain?")

### What we're testing

| Hypothesis | How we know if it's wrong |
|---|---|
| "Data leads spend hours building reports nobody reads" | If they say "my team reads everything" or "I don't build reports" |
| "Audio is a format people would actually consume" | If they say "I'd rather read" or "I don't listen to audio at work" |
| "2-minute executive summary > 15-minute podcast" | If they say "I want the full detail" or "2 minutes isn't enough" |
| "Weekly digest creates a habit" | If they say "I'd set it up once and forget" or "weekly is too often" |
| "Teams would forward this in Slack" | If they say "my team wouldn't click a Slack link to an audio player" |
| "Onchain doesn't matter for enterprise" | If enterprise leads say "the audit trail is the most interesting part" |

### What to do with results

- **If audio is rejected:** Pivot to dashboard-only with email summaries. Keep audio as a secondary feature.
- **If 2-min format is rejected:** Make the full podcast the default. Keep exec summary as an option.
- **If "reports nobody reads" pain isn't felt:** The repositioning is wrong. Go back to the observability angle.
- **If onchain matters to enterprise:** Reconsider the persona split. Maybe onchain is a pillar after all.

---

## Field-Sales Allocation Discovery

### Status and scope

A founder interview at a school publisher surfaced a separate, high-value hypothesis: fragmented sales emails and activity records can reveal that high-potential schools are under-covered, reps are allocated to mismatched portfolios, and observed top performance is partly explained by account quality rather than rep behaviour.

This is not evidence to pivot DataBard into generic sales analytics. It is evidence to test a tightly scoped workflow: an evidence-backed allocation briefing for field-sales leaders. See [`docs/FIELD_SALES_ALLOCATION.md`](FIELD_SALES_ALLOCATION.md) for the product hypothesis and trust model.

### Pilot interview questions

- "Which school/account allocation or visit-prioritisation decision would you make differently if the evidence were reliable?"
- "What determines a school's realistic revenue potential, and who can correct that estimate?"
- "Where do reps actually record visits and follow-ups: CRM, email, WhatsApp, calendar, manager reports, or elsewhere?"
- "Which accounting outcomes are authoritative for this decision: order, invoice, payment, renewal, credit note, or another metric?"
- "What account, activity, or accounting data would you permit on a read-only basis? What must never leave your environment?"
- "What evidence would make you trust a recommendation to change coverage or reassign an account?"
- "Which recommendation would be too consequential to automate, even with strong evidence?"

### What validates the opportunity

| Hypothesis | Evidence that supports it | Evidence that weakens it |
|---|---|---|
| Allocation is a recurring, expensive decision | Managers regularly change territories, account ownership, or visit plans | Allocation is fixed by policy and rarely revisited |
| Account potential and activity can be linked to outcomes | A usable account identifier connects activity, orders, invoices, or payments | No reliable account matching or outcome history exists |
| The briefing changes operating behaviour | A manager adopts or challenges a specific recommendation with its evidence | The output is interesting but does not change a decision |
| The workflow can earn trust | The customer accepts scoped exports and requests recurring analysis | The customer requires opaque full access or cannot define acceptable evidence |

### Pilot boundaries

- Start with reviewed exports: account master, activity history, and a limited commercial outcome extract.
- Use accounting data as an independent reconciliation layer, not as a reason to ingest a full general ledger.
- Compare like with like; never rank reps by raw revenue or visit counts alone.
- Require manager approval for any account reassignment or performance-sensitive action.
- Do not build a live Xero/QuickBooks connector or zero-knowledge system until the pilot proves the repeated decision workflow.

---

## Analytics & Instrumentation

### What we track (Plausible script + custom events via `src/lib/track.ts`)

| Event | Where | What it tells us |
|---|---|---|
| `landing_cta_click` | Landing page | Which CTA (demo vs connect) converts better |
| `persona_toggle` | Landing page | How many users switch between Teams and Protocols |
| `demo_play` | Landing page | Zero-friction conversion rate |
| `connect_start` | Connect step | Funnel: landing → connect |
| `connect_complete` | Connect step | Funnel: connect → schema selection |
| `generate_start` | Generation | Funnel: schema → generation |
| `generate_complete` | Generation | Funnel: generation → dashboard |
| `dashboard_listen_click` | Dashboard | How many users click "Listen to this analysis" |
| `schedule_setup` | Dashboard/Pro | Conversion to retention loop |
| `share_click` | Episode page | Viral coefficient |
| `shared_episode_open` | Shared episode | Reach of shared links |
| `shared_episode_cta_click` | Shared episode | Viral → conversion rate |

### Funnel targets (initial)

| Step | Target conversion |
|---|---|
| Landing → Demo play | 30% |
| Demo play → Connect | 15% |
| Connect → Generate | 60% |
| Generate → Dashboard listen | 40% |
| Dashboard → Schedule setup | 10% |
| Shared episode → CTA click | 5% |

These are guesses. The interviews and analytics will tell us the real numbers.

---

## Content & Social

> Full post drafts, UGC engines, and the 4-week cadence live in
> [`docs/CONTENT_PLAYBOOK.md`](CONTENT_PLAYBOOK.md) — headline concept: the
> Protocol Data-Health League Table (public subgraph scores, attested on-chain).

### Blog posts (priority order)
1. "We replaced our weekly data report with a podcast" — the founding story
2. "AI roasted my database — and it was right" — the viral angle
3. "How we use Solana as a tamper-evident audit trail for data quality" — the technical angle
4. "Data health scores: what 87/100 actually means" — the educational angle

### Social content
- 15-second clips of Morgan's harshest call-outs (from real schemas, with permission)
- "DataBard Health Score: 87/100" badges in team READMEs
- Before/after: "Here's our weekly report (Notion doc, nobody read it) vs. our weekly briefing (2-min audio, 100% listen rate)"

### Communities to engage
- r/dataengineering
- dbt Slack (data-ops channel)
- Local Data Engineering meetups
- Hacker News (launch post)
- Twitter/X (data engineering community)

---

## Manual outreach: first 10 users (PG approach)

> *"Get users manually. Go to them. Don't wait for them to come to you."*
> — Paul Graham

The email capture forms on shared episodes, verify, leaderboard, and landing
page are passive — they wait for the user. The first 10 users come from us
going to them. This is the list.

### How to do it

1. Find the person who cares about data quality (usually an analytics engineer
   or data lead, not the founder)
2. Say: *"I'll run a free data health report on your subgraph/Dune dashboard
   and send you the audio briefing. No setup, no commitment. If it surfaces
   something you didn't know, tell me. If it doesn't, tell me that too."*
3. Run the report on their actual data
4. Send them the briefing link
5. Ask: *"Did this surface something you didn't already know?"*
6. If yes: ask for a 15-minute call. If no: ask what would have been useful.

### Target list: 5 Solana protocol teams

These are teams we already have seeded data for. They have public Dune
dashboards or subgraphs we can analyze without any integration.

| # | Protocol | Why them | Data surface | Who to find |
|---|----------|----------|--------------|-------------|
| 1 | **Jupiter** | Largest Solana DEX aggregator. Routing data quality directly affects user outcomes. | `jupiter.swap_metrics` (already seeded, score 92) | Analytics engineer or data lead in their Discord |
| 2 | **Marinade Finance** | Largest Solana liquid staking protocol. TVL and validator data health is core to trust. | `marinade.staking` (already seeded, score 71, declining) | Data/infra team — mSOL price feed freshness is a known risk |
| 3 | **Raydium** | Major AMM. Pool reserve and farm reward data quality affects yield calculations. | `raydium.amm` (already seeded, score 88) | Backend/data engineer in their Discord or GitHub |
| 4 | **Orca** | Concentrated liquidity DEX. Tick data health is critical — bad ticks = bad quotes. | `orca.whirlpools` (already seeded, score 68, degrading) | Their docs/Dune analytics contributor — the degradation story is the hook |
| 5 | **Pyth Network** | Oracle protocol. Data quality IS their product. If their own internal data health is bad, that's a story. | Not yet seeded — would need to analyze their internal dashboards | Their data infra team — the pitch is "you sell data quality, do you monitor your own?" |

### Backup list (if the first 5 don't respond)

6. **Helius** — RPC/infrastructure provider, they understand data quality deeply
7. **Tensor** — NFT marketplace, analytics-heavy, active Discord
8. **Kamino Finance** — lending protocol, health factor calculations depend on data quality
9. **Drift Protocol** — perps DEX, oracle and pricing data is critical
10. **Mango Markets** — legacy but still has data infrastructure worth analyzing

### The pitch for each outreach

> *"Hey — I'm building DataBard, a tool that turns data health into a weekly
> audio briefing. I ran a report on [protocol]'s public Dune dashboard and
> it surfaced [specific finding, e.g. 'your tick data has 2 failing tests
> and hasn't refreshed in 72 hours']. Here's the 2-minute briefing:
> [link]. Did this surface something you didn't already know? If yes, I'd
> love 15 minutes to hear what's useful. If no, tell me what would have been."*

### What we're testing

- **Does the briefing surface something they didn't know?** (value validation)
- **Would they pay $49/month for this every week?** (price validation)
- **How many schemas does a real protocol team track?** (unit economics)
- **Who is the buyer?** (data lead? eng lead? founder?)
- **What's the alternative?** (manual dashboard checking? Datadog? nothing?)

### Tracking

Every lead captured from manual outreach should be tagged with
`source: "manual_outreach:<protocol>"` in `data/leads.json` so we can
distinguish organic leads from outreach leads.
