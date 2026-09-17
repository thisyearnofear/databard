# Story Layer — progressive disclosure for DataBard

**Purpose of this doc:** the durable map of *what we are building, why, and where we
stopped*. Read this first when resuming the UX work. Status is factual as of
**September 17, 2026** — check the boxes against the code before trusting them.

### Resume here (Sep 17 evening)

Phase 1 code + story tests are done. **Full chromium green with `--workers=1`
against a fresh `npm run dev` (26/26).** Parallel workers can wedge Turbopack —
treat multi-worker timeouts as env, not product, until reproduced serially.

Next (only if not already done this session):

1. Manual click-through: `episode=demo-enterprise` Teams path + Listen CTAs.
2. Commit Phase 1 + this doc, then `./scripts/deploy.sh`.
3. Do **not** start Phase 2 until after deploy validation.

## The problem we are solving

DataBard's value is **synthesis**, but the UI presented every layer at once: a
decision hero, a second competing hero, counters, trends, a fleet chart, and fully
expanded source cards, all at similar visual weight. The user had to assemble the
story and find the proof themselves.

**The product promise we are enforcing in the UI:**

> An analyst hands you the decision, walks you through the story, and opens the
> evidence only when you ask.

## The rule: three layers, one spine

Every major surface follows the same spine. Progressive disclosure here is a
**product rule**, not a collapsible-widget choice.

| Layer | Question it answers | Default state |
|---|---|---|
| **L0 Decision** | What changed, why it matters, what do I do next? | Always visible |
| **L1 Story** | How did we get here — ordered, with consequences | One tap / one expansion |
| **L2 Evidence** | Columns, tests, lineage, receipts, attestations | On demand only |

Constraints that make this safe and reviewable:

1. Never show all three layers at equal visual weight.
2. Every disclosed layer must answer a question the previous layer created.
3. Add narrative **structure**, not narrative **content** — reuse existing analysis
   data. No LLM calls, no new endpoints, no new fetching.
4. When a sentence composer has no data, render **nothing** — never placeholder or
   fabricated text.
5. Prefer native `<details>`/`<summary>` so keyboard and screen-reader behaviour
   survives for free.

---

## Phase 1 — Hierarchy without new features (implemented; story gates green)

**Goal:** fix comprehension with zero new backend. This is a *reorganization*
release, not a feature release.

### Protocol dashboard (`/protocol`)

- [x] **L0 single hero** (`src/components/briefing/BriefingHero.tsx`) replacing the
      competing pair (`PriorityBriefingCard` + `DecisionBriefing`). Three states:
      episode-led -> finding-led -> calm confirmation. One primary action (Listen).
- [x] **L1 story section** — `ChangeNarratives` promoted to `id="story"`, retitled
      "The story this week", with a per-item "Why it matters" clause, an inline
      finding summary, a "View evidence" anchor, and a `Show all N changes`
      disclosure replacing the silent 5-item truncation.
- [x] **L2 evidence section** — counters, fleet chart, write-back, and source cards
      wrapped under an explicit "Evidence behind the briefing above" label.
- [x] **Fleet chart caption** composed from existing history (largest mover /
      quiet week / insufficient history).
- [x] **Source cards collapsed** — L0 shows name, health, trend, one-sentence
      finding, Listen. Coverage, mini stats, critical tables, hotspots, sparkline,
      mint counts and the full-report link moved into a `Details` disclosure.
- [x] **Deep links** — `#story` and per-source `#source-<name>` anchors with
      `scroll-mt-8` so anchors land below the sticky header.
- [x] **Write-back relocated** out of the decision flow into the evidence section.

### Episode player (`EpisodePlayer`)

- [x] **Six tabs to three story views**: `Story` | `Evidence` | `Actions`, with
      Anthem and Team history demoted into a `More` disclosure.
- [x] **Story tab** — transcript segments are claim-first: topic label, text, then
      `Evidence for this claim` and `Share this finding`, with audio sync,
      auto-scroll, seek-on-click and the existing table drill-down preserved.
      The evidence link opens the *matching* table when the segment topic resolves.
- [x] **Evidence tab** — health overview, coverage, critical tables, hotspots, the
      research trail, and a new **table explorer** with per-table owner and failing
      test count, expanding to the existing `TableDetail`.
- [x] **Actions tab** — unchanged ranking and behaviour, now the single home for
      fixes, share, schedule and report generation.
- [x] **Bottom line** in the player header (composed from existing fields).
- [x] **Per-segment share** reuses the existing clip/score-card path via
      `handleClip(segmentIndex)` — `seg=` URLs and TTL semantics unchanged.
- [x] **Branching** now lands on the Story tab instead of a separate Research tab.

### Primitives and instrumentation

- [x] `src/lib/story.ts` — pure, isomorphic sentence composers: `findingSentence`,
      `consequenceSentence`, `calmConfirmation`, `chartCaption`, `bottomLine`.
      Each returns `null` when inputs are absent.
- [x] `tests/story.unit.ts` — 6 offline tests, wired into `npm run test:unit`.
- [x] `tests/story.spec.ts` — 3 browser tests: layer order, trend-to-anchor jump,
      evidence collapse behind `Details`.
- [x] New events `story_expand`, `evidence_open`, `finding_share` added to
      `EVENT_TYPES`. **No existing event name or meta shape was renamed.**

### Preserved deliberately (do not regress)

Routes and URL params; workspace logic; all data fetching; audio pipeline, waveform,
speeds, countdowns; share URLs, OG cards, TTL, `seg=` semantics; attestation
verification and its trust language; theme tokens and dark-first behaviour;
existing analytics semantics; onboarding `data-tour` targets.

---

## Phase 2 — Narrative objects (NOT STARTED)

Make the claim/so-what/proof/action shape a real shared data structure instead of
composed sentences.

- [ ] Define a `NarrativeFinding` type (`claim`, `soWhat`, `proof[]`, `action`).
- [ ] Render dashboard story items, transcript segments, score cards and league
      rows from that one shape.
- [ ] Per-finding share links (extend the current `seg=` mechanism).
- [ ] Migrate `src/lib/story.ts` composers to produce the object, not just strings.
- [ ] Annotations (a human note attached to a finding).

**Why later:** Phase 1 already delivers the comprehension win. Phase 2 is what makes
stories *portable across surfaces*. Do not start before validating Phase 1.

## Phase 3 — Story mode (NOT STARTED)

Editorial control over the generated narrative: select findings, reorder, annotate,
export as briefing / Slack update / score card / evidence pack. **No new analysis
engine required** — curation UI over existing output.

## Phase 4 — Collaborative stories (NOT STARTED)

Comments, ownership assignment on findings, follow-up questions attached to
narrative blocks, retention loops around repeat usage.

---

## Verification (Sep 17, 2026)

| Gate | Result | Notes |
|---|---|---|
| `npm run test:unit` | **PASS** (exit 0) | Includes `tests/story.unit.ts` (6) |
| `tests/story.spec.ts` (chromium) | **PASS** (3/3) | Layer order, trend→anchor, Details collapse |
| Full chromium e2e (`--workers=1`) | **PASS** (26/26) | Fresh `npm run dev`; ~42s |
| Teams demo click-through | **PASS** | `episode=demo-enterprise` → Connect (dbt) + Listen → Story/Evidence/Actions player |

### Full-suite notes

Parallel workers against Turbopack can wedge the reused server (`page.goto`
timeouts, `Request context disposed`). Reproduce with `--workers=1` before
treating failures as product bugs.

Hardening shipped with this verification pass: `?start=connect` owns the
workspace source default (connection localStorage no longer races it), and URL
workspace sync waits for persona restore before rewriting.

### How to verify (copy-paste)

```bash
# Prefer a fresh server — kill anything on :3000 first if reuse looks stale
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/insights
npx tsc --noEmit
npm run test:unit
npx playwright test tests/story.spec.ts --project=chromium
npx playwright test --project=chromium --reporter=line
```

## Gotchas learned the hard way (save yourself the time)

1. **Playwright needs a live dev server** on `localhost:3000`
   (`reuseExistingServer: true`). If `curl http://localhost:3000/api/insights`
   returns `000`, tests fail with `ERR_ABORTED`. A stale dev server holding the port
   makes failures look like product bugs.
2. **`briefingSourceName()` groups by the FQN prefix.** `db.sales` and `db.orders`
   collapse into a *single* `db` card, so anchors differ from what you expect.
   Test fixtures need distinct prefixes (e.g. `sales.core`, `orders.core`).
3. **Use `{ exact: true }` with `getByText` inside source cards.** Loose matching
   resolves both the finding sentence and the label, throwing a strict-mode
   violation that *looks* like a visibility failure.
4. **Mock the endpoint the page actually calls**: dashboard mints come from
   `/api/onchain/mints/stats`, not `/api/insights/mints`.

## Open questions (decide before Phase 2)

1. Should Anthem / Team stay top-level? No event tracks them; they were demoted to
   `More` on the assumption they are not decision views.
2. Is per-segment `Share this finding` desirable, or does it dilute the score card?
   It is **implemented** — revisit if `finding_share` volume is noise.
3. Does merging the two heroes break the `episode=demo-enterprise` Teams path?
   **Needs a manual demo click-through before any deploy.**
