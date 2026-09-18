# DataBard GTM: Two Distribution Loops

*Rewritten 18 September 2026 alongside STRATEGY.md. The old GTM was built for
the audio-wedge wizard. This one is built for what ships today: public
accounting for humans, agent tools for machines.*

## North Star

DataBard turns public data into public accounting — reports people share and
agents call, every finding dated, receipted, and checkable. Distribution is
built into the artifact: the subject shares the report because it is flattering
and verifiable; the agent finds the tool because it is listed and measurable.

---

## Loop 1: The Edition Share Loop (humans)

```
A sponsor opens their free preview (/earn/[slug])
  → the report is flattering and checkable
  → they share the preview link, or publish a dated edition ($25)
  → the page travels: OG card, permalink, "commissioned by" attribution
  → a peer sponsor sees it, opens their own preview
  → (loops)
```

Why it works: the subject does the distribution. A page that says "Jupiter
ranks #7 by listings in the Earn economy" with a receipt anyone can check is
something its subject *wants* in the world. Verification is the reason it can
be shared credibly, not a bolt-on.

Supporting surfaces:

- `/superteam` — the flagship showcase (Superteam UK). The proof of the
  pattern; not for sale.
- `/league` — the weekly protocol data-health table. Repeat-visit magnet and
  copy-tweet source (`league_share_copy`).
- `/roast` — the emotional-trigger variant. Lower intent, high shareability.
- OG images per report — the share card is the ad.

## Loop 2: The Agent Discovery Loop (machines)

```
An agent (or its operator) browses a registry — OKX.AI, Monid
  → finds databard_health_check (free)
  → calls it, gets a real finding + recommended next step
  → upgrades to databard_briefing ($1, x402) when it needs the full synthesis
  → uses databard_probe ($1) before paying *other* services
  → verdicts and receipts attest on-chain → reputation accrues
  → (loops)
```

Why it works: free tools are the discovery driver; paid tools are metered by
the same rails the customer already uses (x402, USDT0 on X Layer). Every paid
call returns a receipt, so the tool's own marketing is its output.

Status: listed on OKX.AI (September 2026), integrated with Monid. Real calls
are happening; sustained volume is the open question.

---

## Hooks

### Hook 1: "Your organization, measured" (the wedge)

Search the directory, open a free preview, see your organization ranked and
receipted. The wow moment is personal and instant — no signup, no wallet. The
upgrade path (publish a dated edition) is one click from the feeling.

Weaponise: send named sponsors their preview link directly. Don't describe the
product; hand them their own page.

### Hook 2: The receipt as the flex

Every share carries the implication "this can be checked." For web3-native
audiences, the hash and the on-chain payment attribution are status. Make the
receipt visible on the page, not buried in a FAQ.

### Hook 3: Probe as the "Wirecutter for agent services"

Probe reviews agent services so agents don't have to gamble. That is a content
engine: every probe run is a potential public verdict — "we measured five
token-price endpoints; here's the one worth paying." Publish the interesting
ones.

### Hook 4: "Roast my data"

Still live, still the lowest-friction emotional entry point. Feeds the top of
Loop 1; don't invest further unless the numbers say so.

---

## The First 10 (manual, per operating principle 2)

1. Earn sponsors with the most flattering previews — send the link, ask the
   one question: "Did this surface something you didn't already know?"
2. Protocol data teams (the five named in earlier outreach) — the league is
   the conversation opener.
3. Agent builders on OKX.AI / Monid — the free health check is the hello;
   Probe is the differentiator.

The answer that matters is not "do you like it" but "did you share it."

---

## Measurement

The event ledger (`src/lib/events.ts`) already tracks the funnels:
`landing_cta_click`, `shared_episode_open`, `shared_episode_cta_click`,
`clip_share`, `league_page_view`, `league_share_copy`, `roast_page_view`,
`roast_cta_click`, `probe_run`, `monday_signup`, plus wizard-era events for
the supporting surface.

The numbers to watch weekly:

- Preview → publish conversion (the $25 decision)
- Share rate on previews and editions (the loop actually looping)
- Agent calls per week, free → paid upgrade ratio
- Probe runs, and whether any public verdict gets picked up

## What We Deliberately Don't Do

- No paid acquisition while the loops are unmeasured.
- No bespoke reports for money — that's agency creep (see STRATEGY.md).
- No growth features that compromise the honest-labels discipline. A growth
  hack that makes a number unverifiable is a brand loss, not a win.
