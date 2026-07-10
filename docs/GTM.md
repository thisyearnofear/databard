# DataBard GTM: Viral Hooks, Engagement Loops, and User Interviews

## North Star

**DataBard solves the communication gap between data teams and everyone else.** The weekly digest is the wedge. The trend narrative is the moat. The shared episode link is the viral surface.

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
  ├─ Demo: hears AI hosts discuss sample schema (zero friction)
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

## What's Missing in Each Loop

### Attention → Conversion: mostly works
- The demo is zero-friction ✓
- The landing page tells the story ✓
- **Missing:** The "share this moment" clip feature. Right now you can only share a full episode link, not a 15-second highlight.
- **Missing:** The "roast my data" framing isn't in the copy. The landing page says "AI analyst" when it should also say "AI roasts your data quality."

### Conversion → Retention: weakest link
- After generation, we now land on the dashboard ✓
- **Missing:** There's no prompt to set up a weekly schedule after the first generation. The user generates, sees the dashboard, and... then what? There's no "Want this every Monday?" CTA on the dashboard.
- **Missing:** Email delivery for scheduled digests. Right now it's RSS only. Most people don't use podcast apps for work content. Email is the delivery mechanism that would actually create the habit.
- **Missing:** The "first generation to schedule" funnel is too many steps. You generate → go to dashboard → navigate to /pro → sign in → create schedule. It should be one click from the dashboard.

### Retention → Viral: partially works
- Shared episode links exist ✓
- **Missing:** The shared episode page (`/episode/[id]`) doesn't have a "Get this for your data" CTA. It's just a player. This is the biggest missed viral surface.
- **Missing:** Health score badge/sharing feature. No way to publicly display your score.
- **Missing:** Team email recipients for scheduled digests. The data lead can't add their team to the distribution list.

---

## Build Priorities (in order)

1. **"Get this for your data" CTA on shared episode pages** — highest-leverage viral surface. Every shared Slack link becomes a conversion opportunity. 1-2 hours.

2. **"Want this every Monday?" prompt on the dashboard** — after the first generation, show a one-click schedule setup. Pre-fill the schema and source. 2-3 hours.

3. **"Share this moment" clip feature** — let users share a 15-second audio clip of the most critical segment. This is the social media viral hook. 3-4 hours (needs audio clipping + shareable link).

4. **Email delivery for scheduled digests** — add an email recipients field to ScheduleConfig and send the episode link + 1-line summary via email. This is what makes the weekly digest actually work as a habit. 4-6 hours (needs email sending integration).

5. **"Roast my data" landing page variant** — a playful alternate landing page that frames the product as "let AI roast your data quality." Test it against the current "AI analyst" framing. 1-2 hours.

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

## Analytics & Instrumentation

### What to track (once PostHog/Plausible is added)

| Event | Where | What it tells us |
|---|---|---|
| `landing_cta_click` | Landing page | Which CTA (demo vs connect) converts better |
| `persona_toggle` | Landing page | How many users switch from enterprise to onchain |
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
