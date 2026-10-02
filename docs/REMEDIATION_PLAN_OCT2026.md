# Remediation Plan: Closing the Rating Gaps (Oct 2026)

*Written 2 October 2026. Scopes concrete engineering work against the gaps
identified in the Oct 2026 design/funnel/positioning review. Slots into the
existing roadmap (`PLAN.md` Phases 11 & 14) rather than replacing it — this
doc is the "how," `PLAN.md` stays the "what/when."*

## Scoring baseline → target

| Dimension | Current | Target | Primary lever |
|---|---|---|---|
| Positioning | 7/10 | 8/10 | Collapse front-door sprawl, fix docs/code drift |
| Funnel | 5/10 | 8/10 | Fix payment-recovery friction, make funnel numbers visible, stabilize OKX loop |
| Product design | 7/10 | 8/10 | Make the wizard's "supporting surface" status real (lighter), not just rhetorical |
| Utility/offering | — | heightened | Turn Probe verdicts into public content; reduce checkout friction |

---

## Workstream A: Make the funnel visible (prerequisite for everything else)

**Status: shipped (Oct 2, 2026).** `/admin/funnel?key=$ADMIN_SECRET` — 404s
when unset or mismatched. Both GTM loops render with all-time + trailing-7d
counts and per-step conversion; a friction card tallies `meta.reason` on
recovery events; the full `EVENT_TYPES` inventory auto-surfaces new types.
`AGENTS.md` event list synced verbatim (~20 missing types restored). Remaining:
set `ADMIN_SECRET` in prod env to enable it there.

**Problem:** `GTM.md` says "review weekly," but there is no dashboard — numbers
live in raw `data/events.json`/`pageviews.json`, and `AGENTS.md`'s documented
event list has drifted from the actual `EVENT_TYPES` in `src/lib/events.ts`
(missing `edition_preview`, `edition_published`, `edition_payment_recovery`,
`story_expand`, `evidence_open`, `finding_share`, etc.).

**Tasks:**
1. `src/app/admin/funnel/page.tsx` (new, auth-gated behind a simple shared
   secret in `ADMIN_SECRET` env — not public): renders `GET /api/events`
   stats as the two loops from `GTM.md` — edition funnel (`earn_index_view` →
   `edition_preview` → `edition_intent` → `edition_published`, with
   `edition_payment_recovery` as a friction counter alongside) and agent
   funnel (`agents_page_view` → `agent_demo_run` → `probe_run` →
   `service_score_lookup`). Pure server component, reads existing
   `getEventStats()` — no new tracking needed, just visualization.
2. Fix `AGENTS.md` "Tracked funnel events" list to match `EVENT_TYPES`
   verbatim (one-line sync, prevents re-drift being the question next time).
3. Add a short header comment in `src/lib/events.ts` pointing at the new
   `/admin/funnel` page so future event additions get surfaced automatically.

**Effort:** ~0.5 day. **Risk:** low (additive, read-only page).
**Gate:** can answer "what's this week's preview→publish rate" without grep.

---

## Workstream B: Fix the payment-recovery friction (highest-leverage funnel fix)

**Status: shipped (Oct 2, 2026).** Root cause was the confirmation race:
`sendRawTransaction` resolves when the RPC *accepts* the tx, then the
single-shot verify hit `getTransaction(commitment:"confirmed")` → `not-found`
→ pending → manual recovery on every publish. Fix: verify route marks
unsettled verdicts `pending:true`; `recoverCheckout` polls while pending
(8×2.5s inline, 4×2.5s on manual check — hard verdicts never retry); the
pending record persists `lastError` → `meta.reason`/`via` on recovery events;
a saved payment auto-rechecks once on mount. Same fix applied to Pro checkout
(new `pro_payment_recovery` event). Pending: production validation of the
next real preview→publish attempts via the dashboard.

**Problem:** Local sample shows `edition_payment_recovery` at a 1:1 ratio with
`edition_published` (2:2) — every successful publish in the sample was
preceded by a recovery event. That's the single most concrete, codeable
finding from the review.

**Tasks:**
1. Read `src/lib/pusd.ts` + the publish-flow component (`PublicationFrame` per
   `AGENTS.md`) + wherever `edition_payment_recovery` fires, to find the exact
   failure mode (wrong-chain payment? wait-for-confirmation timeout? wallet
   popup drop-off?). *This requires one read-through before deciding the fix
   — flagging now so the plan doesn't guess at a root cause.*
2. Likely fix shapes (confirm against findings in step 1):
   - If it's a confirmation-polling timeout: lengthen the poll window and show
     a persistent "still checking the chain" state instead of a dead end.
   - If it's multi-rail confusion (PUSD vs SOL vs USDC): default to the single
     most reliable rail in the UI, offer others behind "pay a different way."
   - If it's wallet-connect drop-off: add a resumable payment intent (already
     have `edition_intent` as a stored state) so a refreshed page re-offers
     the same pending payment instead of restarting.
3. Add `meta.reason` (already-whitelisted free-text-ish field, 120 chars) to
   every `edition_payment_recovery` call site so the admin dashboard in
   Workstream A can show *why*, not just *that*.

**Effort:** ~1–1.5 days (half discovery, half fix). **Risk:** medium — touches
real payment code; test against the existing devnet/testnet path before any
mainnet rail change, no behavior change to the two already-successful
publishes.
**Gate:** next 5 preview→publish attempts (real or synthetic) complete with
zero recovery events, or the dashboard shows the reason distribution shrinking.

---

## Workstream C: Stop the OKX delist cycle (agent-loop stability)

**Status: shipped (Oct 2, 2026).** `scripts/briefing-latency-check.mjs` pays a
real `/api/mcp/briefing` call against prod and times it (self-pay → the $1
rotates back to our own `PAY_TO_ADDRESS`, so cost ≈ $0); daily cron at 05:23
installed by `deploy.sh` — hourly was rejected as wasted float churn —
breaches log to
`briefing-latency.log` + optional `BRIEFING_ALERT_WEBHOOK` POST.
`tests/briefing-config.unit.ts` guards `syncSettle:true` (source-level — the
plan's `false` was wrong; async settled nothing on Sep 25) and the
`audio:"none"` default in `parseMcpInput`. Pending: a week of green runs.

**First-run finding (Oct 2, resolved same day):** the monitor's first live
run caught a real outage — paid calls returned `OKX verify failed: 401`, and
a direct signed call to the facilitator confirmed OKX was rejecting the API
key itself (`50125: no access to current services`). Root cause: the OKX
Developer Portal **trial plan expired** (key provisioned Sep 25 for the Dev
Day work), which revoked the key's access to the `x402/pay` service — unpaid
402s kept flowing, so every existing check looked green while every real
payment died. Fixed by upgrading the OKX plan; post-fix run:
`green: unpaid 282ms, paid 1239ms, settled=true`. Lesson now wired in:
unpaid checks can't see a dead facilitator — only a paying call can.

**Problem:** Delisted 3 times for paid-endpoint timeout, each time fixed
*after* OKX's own test request failed — reactive, not caught in advance.

**Tasks:**
1. Promote `scripts/probe-smoke.mjs`'s pattern into a scheduled synthetic
   check: a small script (`scripts/briefing-latency-check.mjs`) that pays and
   times a real `/api/mcp/briefing` call against prod, logs latency, and
   exits non-zero if it exceeds a budget (e.g. 5s — comfortably under
   whatever OKX's own timeout is). Wire into the existing `ensure-running.sh`
   cron cadence (every 2 min is overkill for this — hourly is enough) or a
   separate cron entry.
2. On budget breach, write to the same channel `ensure-running.sh` already
   uses for alerts (check `docs/OPERATIONS.md` for what that is — email/log)
   so a regression is caught before OKX's reviewer hits it, not after.
3. Add a regression test asserting `syncSettle:true` (the facilitator option in
   `src/lib/x402.ts` — **true**, not false: async was tried Sep 25 and settled
   nothing, the comment there documents why) and default `audio:"none"` in
   `parseMcpInput` — both were the root cause of two of the three delistings;
   a silent revert of either should fail CI, not production.

**Effort:** ~1 day. **Risk:** low (new script + one assertion test, no
behavior change to the live route).
**Gate:** one full week with the synthetic check green and no OKX status
regression on `onchainos agent service-list --agent-id 9878`.

---

## Workstream D: Collapse front-door sprawl → one spine, four doors with explicit roles

**Status: shipped (Oct 2, 2026).** Better starting state than feared —
`PublicReportHeader` already spans every public surface
(`/`/`/earn`/`/agents`/`/probe`/`/verify`/`/league`/`/roast`) with all four
doors linked, and `/agents` already numbered `/probe` as door #2. Actual
deltas shipped: `/probe`'s standalone hero pitch collapsed into a tool
header (kicker "Agent tools · Probe" anchors it under `/agents`; the 3-step
sell and duplicate subtitle removed — that copy lives on door #2), and the
wizard's own top bar now carries a "Connect your data" surface label so
stale-link visitors know which product they're in.

**IA note — one job per surface:**
- `/` (ReportLanding) — see a public finding; the share loop's front door.
- `/earn` — the sponsor report index; the share loop's money step.
- `/agents` — the agent doorway: one pitch, four numbered doors
  (free health-check demo → `/probe` → marketplace index → `/verify`).
- `/probe` — door #2 made concrete: run the comparison preview. Tool page,
  not a pitch.
- `/probe/marketplace` — the public health index (Probe's reputation loop).
- `/verify` — check an anchored report commitment.
- Wizard (`/?workspace=…`) — "connect your own data", the supporting
  surface; now labeled in its top bar.

**Problem:** `/`, `/agents`, `/probe`, and the wizard each carry an
independent hero/CTA set. Not wrong individually, but a cold visitor can land
on any of the four and get a different one-sentence pitch.

**Tasks:**
1. Write (don't yet ship) a one-page IA note: each surface gets exactly one
   job statement, reusing the existing copy that already works best per
   surface (no rewrite needed, mostly re-labeling):
   - `/` — "see a public finding" (ReportLanding, unchanged — this one is good)
   - `/agents` + `/probe` — "call or evaluate a tool" (merge `/probe`'s hero
     into `/agents` as its "Check a service" door, rather than two separate
     page-level pitches — `/probe` already *is* door #2 of `/agents`'s four
     numbered doors per the current copy, so this is mostly removing a
     duplicate hero, not a rebuild)
   - Wizard (`LandingStep.tsx` / `WizardHome`) — explicitly re-labeled in-UI as
     "connect your own data" (it already is this; the fix is a visible
     breadcrumb/badge so a visitor who lands there via a stale link or
     `?workspace=` knows they're in the supporting surface, not confused
     about which product they're in)
2. Add a persistent, minimal top-nav (if one doesn't already exist across
   these pages — check first) so the three doors are reachable from each
   other instead of being four dead-end silos.
3. Defer any wizard reducer/code simplification to Workstream E — this
   workstream is copy/IA only, not a rewrite.

**Effort:** ~1 day (mostly copy/nav, read-first to confirm what nav exists).
**Risk:** low — labeling and cross-linking, no logic changes.
**Gate:** a cold visitor to any of the 3 non-wizard surfaces can name the
other two and knows the wizard is "connect your own data," without being told.

---

## Workstream E: Make "supporting surface" real for the wizard (lighter, not just lower-priority)

**Status: shipped (Oct 2, 2026).** Prod gate data confirmed the premise
before any code was touched: `connect_start` 1, `demo_start`/`demo_play`/
`generate_complete`/`listen_start` all 0 in the live event ledger — the
agent loop (122 marketplace views, 14 probe runs) dwarfs it. Dead-code
sweep: removed action types `ADD_GEN_FINDING`, `RESET_GEN`,
`SET_DUNE_NAMESPACE` (zero dispatch sites each), the `duneNamespace` state
field it could never set (always `""` → `namespace: undefined` on the wire,
identical request bodies), its four reader fallbacks, and the unused
`episodeReady` context action. 49→46 action types. Wizard E2E: 10/10 green.

**Problem:** `wizard-context.tsx`/`wizard-reducer.ts` (5-domain composed
reducer) carries real maintenance weight under a surface with near-zero
tracked usage in the current sample (`demo_play`/`generate_complete`/
`listen_start` all absent).

**Tasks — explicitly scoped to *not* touching behavior, only reducing
surface area that's actually dead:**
1. Before any change: pull real production event counts (not the local
   124-event sample) for `demo_start`, `connect_start`, `listen_start`,
   `generate_complete` over the last 60 days via `GET /api/events` on prod.
   If usage is non-trivial, **stop this workstream** — the finding was based
   on a small local sample and may not generalize; cutting a used surface
   would be a regression, not a cleanup.
2. If prod confirms low usage: identify genuinely dead code paths inside the
   wizard reducers (unused action types, dead branches) via a targeted grep
   for action-type references with zero dispatch sites — remove only those,
   leaving the live wizard flow (Teams/Protocols connect, demo) fully intact.
3. No deletion of entire files/surfaces in this pass — this is a trim, not a
   sunset decision. A sunset decision needs its own confirmation gate with
   the user, informed by real data from step 1.

**Effort:** ~0.5–1 day, *contingent on step 1's data confirming the premise.*
**Risk:** low if gated correctly on step 1; high if skipped.
**Gate:** wizard reducer/effects line count reduced with zero change to
Playwright E2E wizard flow tests (`npm run test:e2e` stays green).

---

## Workstream F: Heighten utility — turn Probe into the content engine GTM already names

**Status: shipped (Oct 2, 2026).** `src/lib/probe-verdicts.ts` persists
verdicts to `data/probe-verdicts.json` (rolling 50) and now owns the shared
preview-pipeline scoring helpers (`scoreResult`/`buildSummary`/
`rankedPayload`) so preview and publish can't drift. `POST
/api/probe/verdicts/refresh` is cron-secret gated (fail-closed without
`CRON_SECRET`), always probes the curated `DEFAULT_CANDIDATES` unpaid —
consent by construction, user candidates can't leak — and withholds the
verdict when the run isn't clean (majority unreachable). `/probe/verdicts`
lists them (ResultCard reuse, per-service links to marketplace entries,
permalinks). `verdict_publish` whitelisted + in AGENTS.md; weekly cron
Mondays 06:41 installed by deploy.sh. Local smoke: 401/401 → real run → 200
published `2026-10-02-8de0e8ed`, page rendered, event recorded.

**Problem:** `GTM.md` Hook 3 ("Wirecutter for agent services") is written but
unbuilt — Probe runs produce verdicts that currently die after one API
response. This is the most direct "more utility, more offering" lever that's
also already-scoped in your own docs, not a new idea.

**Tasks:**
1. `src/lib/probe-verdicts.ts` (new): persist each Probe run's verdict (score,
   6-dimension breakdown, services compared, timestamp) to a lightweight
   store (same pattern as `data/events.json` — JSON file, rolling window) —
   opt-in only for runs where candidates are DataBard's own curated default
   set (never user-submitted candidates, to avoid publishing someone's private
   service comparison without consent).
2. `/probe/verdicts` (new, public): lists published verdicts chronologically —
   "we measured 5 token-price endpoints; here's the one worth paying" — each
   linking back to its receipt the same way editions do. Reuses
   `ResultCard.tsx` for rendering, no new design system needed.
3. One cron entry (reuse `ensure-running.sh`'s cadence pattern) that runs Probe
   against a small curated candidate list weekly and auto-publishes if the
   run completes cleanly — this is the "content engine" running itself,
   consistent with "generated, never crafted" (Product Principle 4).
4. Track a new event `verdict_publish` (added to `EVENT_TYPES`) so this
   immediately shows up in the Workstream A dashboard.

**Effort:** ~1.5–2 days. **Risk:** low-medium (new public page + cron; must
respect the existing `MAX_OUTBOUND_SPEND_USD` cap already in `probe-runner.ts`
— no new spend-cap logic needed, just a scheduler on top of what exists).
**Gate:** first auto-published verdict page live, one real sharable artifact
that didn't exist before.

---

## Sequencing

Dependencies run roughly A → (B, C, D in parallel) → E → F, because:
- **A first**: every other workstream's "gate" is read off the dashboard A builds.
- **B and C are the two active bleeds** (lost conversions, lost listing) — fix
  before adding anything new.
- **D is cheap and independent** — can run anytime once A exists for before/after.
- **E is gated on real data**, not urgent — do after the active bleeds stop.
- **F is the only "more utility" item** — sequenced last on purpose: it's new
  surface area, and Product Principle 4 ("would this work for the next 100
  users untouched?") is easiest to honor once the funnel underneath it
  (B) isn't leaking.

| Workstream | Effort | Depends on |
|---|---|---|
| A — Funnel dashboard + docs sync | 0.5d | none |
| B — Payment-recovery fix | 1–1.5d | A (to measure the fix) |
| C — OKX synthetic monitor | 1d | none |
| D — Front-door IA/copy pass | 1d | none |
| E — Wizard trim (data-gated) | 0.5–1d | A (prod data) |
| F — Probe verdicts content engine | 1.5–2d | B, C stable |

**Total: ~6–8 engineering days**, deliverable incrementally — each workstream
ships and is independently verifiable, none blocks shipping the others except
where noted.

## What this plan deliberately does NOT do

- No rewrite of `ReportLanding.tsx` or the editions pipeline — both already
  work and are rated well; this plan fixes the surrounding friction, not the core.
- No new payment rail or pricing change — Workstream B fixes *flow*, not *price*.
- No wizard sunset decision — Workstream E is a trim with an explicit stop
  condition if prod data contradicts the local sample.
- No paid acquisition — unchanged from `GTM.md`'s existing constraint.
