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

### Hook 3: Probe as the "Wirecutter for agent services" (strongest differentiator — Oct 2026)

Monid finds 1,700+ tools. x402 Agent.market lets agents find and pay. Nobody
measures paid output quality. Probe does: it pays the x402 challenge, scores
6 dimensions, returns a cost receipt, and publishes verdicts with `listing`
vs `paid_delivery` honesty.

Proof point: same "read webpage" job on Monid — top result $0.02376 vs
$0.0009 (26×) at the top of the list. Discovery without measurement misleads.
That is Probe's opening slide.

Every probe run is a potential public verdict — "we measured five
token-price endpoints; here's the one worth paying." Publish the interesting
ones. Priority: ship one paid deep-check verdict with settlement tx to upgrade
`listing` → `paid_delivery` — that unlocks the Wirecutter claim.

### Hook 4: "Roast my data"

Still live, still the lowest-friction emotional entry point. Feeds the top of
Loop 1; don't invest further unless the numbers say so.

---

## The First 10 (manual, per operating principle 2 — Oct 2026 update)

1. Earn sponsors with the most flattering previews — send the link, ask the
   one question: "Did this surface something you didn't already know?"
   Template in `docs/OUTREACH_OCT2026.md`. One per day; log preview→share.
2. Protocol data teams (the five named in earlier outreach) — the league is
   the conversation opener.
3. Agent builders on OKX.AI / Monid — the free health check is the hello;
   Probe is the differentiator. One-pager in `docs/OUTREACH_OCT2026.md`;
   lead with the 26× Monid price gap.

The answer that matters is not "do you like it" but "did you share it."
Honest state: distinctive and unproven — 2 sales are our own tests, relist
pending (`approvalStatus: 6`). The 10-preview test decides it.

---

## Measurement

The event ledger (`src/lib/events.ts`) already tracks the funnels:
`landing_cta_click`, `shared_episode_open`, `shared_episode_cta_click`,
`clip_share`, `league_page_view`, `league_share_copy`, `roast_page_view`,
`roast_cta_click`, `probe_run`, `monday_signup`, plus wizard-era events for
the supporting surface.

### The virality ladder

One scorecard, four rungs. Prove each rung before building the next share
surface — the first unproven rung is where effort goes, not a new hook.

| # | Rung | Events that prove it |
|---|------|----------------------|
| 1 | Someone shares | `clip_share`, `finding_share`, `league_share_copy`, `superteam_share_copy`, `edition_share_copy` |
| 2 | Recipient lands | `shared_episode_open`, `shared_clip_play`; `league_page_view` / `edition_preview` carrying share attribution |
| 3 | Recipient activates | `shared_episode_cta_click`, then `generate_complete` / `connect_start` / `monday_signup` carrying share attribution |
| 4 | Recipient pays | `edition_intent` → `edition_published`, Pro checkout — carrying share attribution |

A rung is **proven** when it produces ≥5 conversions into the next rung per
week for three consecutive weeks (absolute counts — percentages are noise
at this volume). First-touch attribution (`src`/`med`/`cmp` stamped by
`src/lib/track.ts`) is what chains rungs 2–4 together.

Instrumentation: share links get `utm_source=share` + `utm_medium=<channel>`
at copy/share time via `src/lib/share.ts` (`handleClip`/`shareVia`/
`copyCardImage`/`copyShareLink` in `EpisodePlayer`, `LeagueBoard` copy
buttons, `ShareRow`, `CopyReportLink`, and the "Share this finding" re-share
CTA on `/episode/[id]`). Canonical permalinks and OG URLs stay clean;
evidence receipts copy verbatim. `clip_share` meta distinguishes the shape:
`format=image` (PNG card via `/api/og`) vs link copy, and `via=shared_page`
marks recipient→recipient onward shares. Caveat: pre-tagging shares attribute
only by referrer host — DMs and mail clients strip referrers, collapsing to
"direct" — so rung 3–4 numbers before the tagging deploy are floors, not
measurements.

Run the scorecard: `npm run scorecard` (reads `DATABARD_DATA_DIR` or `./data`;
`--data-dir`, `--weeks`, `--json` flags supported). For prod data, scp
`events.json` + `pageviews.json` off snel-bot — no npm install needed, it's a
standalone `.mjs`.

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
