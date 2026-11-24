# Anna Founding Builder Program — DataBard plan

**Program:** Anna (Anima AI OS) × DoraHacks — <https://dorahacks.io/hackathon/2349/detail> ·
rules: [forum topic 205](https://forum.anna.partners/t/turn-your-ai-agents-apps-into-recurring-monthly-grants-join-the-anna-ai-os-founding-builder-program-up-to-80k-month-pool/205)
(read 2026-11-16) · developer docs: <https://anna.partners/llms-full.txt>.
Review lessons come from Brume on the same builder account
(`brume/docs/ANNA.md` §12).

## Current decision, 2026-11-21

Anna rejected v0.1.1 (app 939, version 2400). The developer team's feedback
identified a missing logo and screenshots, checks too limited to offer useful
data-specific repair guidance, and an AI role too close to narrating fixed
validations. They explicitly requested a full Cloud Agent test from a fresh
install before resubmission. Local QA and listing assets on disk do not meet
those requirements. No later submission or approval is claimed here.

Do not infer member headcount from distinct emails or attendance from
registrations. Test substantive diagnosis against real decisions. The
[contact-import pilot and independent sponsor research](CONTACT_IMPORT_PILOT.md)
are discovery, not fixes sufficient to pass review. For a new candidate, add
the logo and screenshots to the actual listing, then test the exact cut from
fresh install through a useful diagnosis and repair recommendation.

## Diagnosis, 2026-11-24

The reviewer named four things. Mapped to code, in order of how hard they are
to fix:

### 1. The AI is not load-bearing (structural)

`bundle/reading.js` sends `reportPayload()` to one `llm.complete` and gets back
four prose fields (`headline`, `claim`, `risk`, `steps`). `auditReading()`
then deletes any figure, quoted name, email or URL that is not already in the
report. If the prose fails, the UI shows the deterministic report with an
honest line.

So the app's primary value — the score, the checks, the findings — is
delivered by `community-health.js` with no model at all. The model is a
constrained copywriter over a finished result. Anna's rule is "Primary value
must depend on AI reasoning or workflows; superficial chatbot add-ons do not
qualify." The reviewer's sentence, "AI role too close to narrating fixed
validations", is an accurate description of this file, not a misunderstanding.

The chat addendum compounds it: the visible assistant reply is a fixed
sentence, so the conversational surface is a doorman too.

### 2. Repair guidance is generic by construction

`community-health.js` emits six checks (volume, identity, completeness,
duplicates, contactable, freshness) with canned `actions`. Because rows never
leave the window, nothing in the output names a row. The result screenshot
says "Merge the duplicate in `email`" — not which duplicate. A reviewer using
their own file gets advice they could have written themselves. That is
"checks too limited to offer useful data-specific repair guidance."

The privacy promise is real and worth keeping. The fix is to do the repair
**in the window**: produce a cleaned file and a change log, so the guidance
is specific without the rows moving.

### 3. The mobile checklist fails on paper

`manifest.json` declares `form_factors: ["desktop", "mobile"]`, which makes
every row of Anna's mobile table a hard gate ("a failed row blocks approval").
Before 2026-11-24 the bundle failed at least three rows:

| Row | State before |
|---|---|
| Do not override the shell `viewport` meta | `index.html` declared its own — fails the grep check |
| Safe-area handling (`env(safe-area-inset-*)` or `--anna-safe-area-*`) | no token anywhere in `app.css` |
| Touch targets ≥ 44×44 pt | `.purpose/.tone/.ghost-btn/.sample-btn` at `min-height: 36px`, `.textlink` at 40px |

### 4. Listing and test process

- No logo asset exists; the eight screenshots were never uploaded to the
  Developer Console, and `sync-meta` only patches name/tagline/description.
- The submission skipped the fresh-install Cloud Agent pass the reviewer
  asked for (account quota was spent).
- The reading was validated on Reflection Beam, not Gemini 3 Flash (Anna's
  default).
- Captures were 1280px wide — the app window is 520×560 — so they read as a
  website, not an app.

### Portfolio context

`anna-app apps list` shows four apps on the account, all rejected: `databard`
(939), `doorknock` (938), `brume` (582, 24 versions), `whoware` (585). Grants
are per-builder portfolio, so another DataBard version adds review history
before it adds grant upside.

## Work plan, 2026-11-24

Ordered so the cheap mechanical gates clear first, then the structural fix.

### P0 — mechanical (must clear before any resubmission)

- [x] Remove the bundle's own `viewport` meta (`bundle/index.html`)
- [x] Safe-area padding via `--anna-safe-area-*` with an `env()` fallback
      (`bundle/app.css`)
- [x] Raise every core control to ≥44×44 (`bundle/app.css`)
- [x] Re-run the 320px walkthrough in `test/browser-qa.mjs` and assert the
      safe-area token, 44px targets and no viewport meta
- [x] Logo asset (`listing/logo-512.png`) + `sync-meta --logo` — uploaded
      2026-11-24 (`cdn.anna.partners/production/app-logos/939-databard/…`)
- [x] Six listing captures at the real window width (520px desktop, 390px
      mobile), replacing the 1280px set
- [x] Six screenshots uploaded 2026-11-24 — `app.json` `screenshots` array +
      `apps sync-meta` (the CLI supports it after all: local paths upload to
      the CDN and the ordered URL list is PATCHed; verified in the console —
      six `app-screenshots/939-databard/*.webp` URLs on the listing record)
- [x] Fresh-install Cloud Agent pass on the resubmission cut — done
      2026-11-24 via BYOK (quota workaround): `Install v0.1.2` from the
      console, `#DataBard` mention in a fresh chat → agent opened the app
      window and correctly stated the privacy boundary (it can't see rows
      or results — by design). In-window run on the messy sample narrated
      fully through `byok:sandbase/anthropic/claude-haiku-5.5`: headline,
      `VERDICT — REPORTING NUMBERS TO A SPONSOR`, `FIX IN THIS ORDER`,
      `SINCE YOUR LAST CHECK` ("Same sheet — nothing moved."), cleaned
      copy. Two notes: (a) the first two in-window runs failed the
      reading contract under `byok:featherless/deepseek-ai/DeepSeek-V3-0324`
      — the app degraded honestly ("could not be checked"), so weak BYOK
      models produce the unnarrated path, not broken output; (b) BYOK
      config used: SandBase provider added at `/llm` (api.sandbase.ai/v1,
      OpenAI-compatible), "Apps & plugins use my API Key by default" on,
      Main Model = SandBase Haiku — revert both after review if unwanted.

**Resubmission cut, 2026-11-24:** `app.json` bumped to 0.1.2, `apps push`
staged the working draft (rev 3, 13 files, 116.6 KB), `apps cut 0.1.2`
froze it as `version_id=2903`. The new listing set is
`anna/listing/{home-520,home-390,run-520,result-messy-520,result-messy-390,result-stale-520}.png`;
all six now carry the verdict line and the model's fix order.
**Submitted 2026-11-24:** `apps submit-review` → `pending_review`,
under review: v0.1.2. Versions cut after this point are not part of this
round — re-run `submit-review` to re-pin.

### P1 — make the AI load-bearing

- [x] **Local repair**: `bundle/repair.js` produces a cleaned CSV and a
      change log in the window (dedupe, normalise emails, drop empty rows,
      trim). Rows still never leave. This answers "checks too limited"
      with row-level specificity.
- [x] **Structured plan**: the reading contract gains an optional
      `priority` list over the report's own check names, audited against
      them, so the model commits to an ordering instead of prose. Falls
      back to severity order when absent.
- [x] **Purpose-weighted verdict**: the contract gains an optional
      `verdict` — one line, the model's call for this purpose ("a list can
      be fine to email yet wrong to quote to a sponsor"). Audited like the
      headline: no invented figures, and it may not restate the score or
      the label. Rendered under the headline; the deterministic verdict
      stays as the unnarrated fallback and in the evidence.
- [x] **Compare to the last saved reading** (`bundle/compare.js`):
      `snapshotOf` keeps aggregates only (score, counts, check states,
      column names — no cell values); `diffSnapshots` returns null for a
      different sheet rather than a meaningless diff. The diff rides inside
      the model payload as `sinceLast`, so its numbers pass the figure
      audit and the model may say what moved. UI: a "Since your last check"
      strip; an identical sheet honestly reports "nothing moved".

### P2 — differentiation

- [ ] Reproducible receipt: export the score + checks as a fixed-format card
- [ ] One app through review first (Doorknock), then reuse the pattern

### Fixed on the way (2026-11-24)

- **Captures drifted from the recordings.** The sample sheets build their
  dates from `Date.now()` at module load, but the capture froze the clock
  *after* load, so a recording made days earlier no longer matched the
  report and the audit dropped every field (the stale shot rendered
  "the reading could not be checked"). `bundle/clock.js` now pins `Date`
  from `?clock=<ISO>` before the bundle loads; captures are reproducible on
  any day. `stale-handover-roast` was re-recorded with Reflection Beam, and
  both listing runs now narrate.
- **`Choose a file` was unstyled** — it had no rule in `app.css`. It is now a
  real 44px control like the rest.
- **Recordings re-made for the verdict contract.** Both captures were
  re-recorded on 24 Nov (Reflection Beam, `prompt-check.mjs --record`,
  narrated on the first call, 0 dropped) so the listing shots show the
  purpose `verdict` line and the model's `Fix in this order` plan — the
  evidence that the model decides, not just narrates. `app.json`
  description updated to cover the verdict + re-check loop and synced live.

### Verification, 2026-11-24

- `node --test test/repair.mjs test/reading.mjs test/recovery.mjs test/dither.mjs test/compare.mjs` — 57 pass
  (compare.mjs is new: snapshot hygiene, same/different-sheet diffs, directions)
- `node test/smoke.mjs` — 22 checks
- `npm run test:browser` — 28 checks (adds the verdict line and the
  since-last-check scenario: change on re-check, honest "nothing moved" on
  an identical sheet, diff numbers on the model wire). The agent-browser
  daemon dropped reads mid-suite twice (`os error 35`); re-running the
  affected cases passed — an infra flake, not a product failure.
- `anna-app validate --strict` — pass
- `node scripts/prompt-check.mjs --provider=reflection --record` — messy/sponsor/straight
  and stale/handover/roast both narrated on the first call, 0 dropped;
  recordings carry `verdict` + `priority`
- `node test/capture-listing.mjs` — regenerated; both runs `narrated=true`,
  verdict line + fix-order + cleaned copy visible at 520px and 390px
- `anna-app apps sync-meta` — description patched live (verdict + re-check)
- `node test/scorer.mjs` **cannot run in this checkout**: it imports
  `typescript`, and `node_modules` is not installed. Not caused by these
  changes; run it after `npm install` in `anna/`.

## Corrections to the first version of this file

- **The window runs to 31 March 2027**, not 30 November. Any calendar month
  inside it can qualify.
- **200 MAU pays $50 a month.** Tiers: 500+ $100 · 1,000+ $200 · 4,000+ $1,000
  · 10,000+ $2,500 · 20,000+ $5,000. Highest tier only.
- **One grant per builder per month** since 1 October, users deduplicated
  across the builder's apps. DataBard on Anna would add its distinct users to
  the same portfolio as Brume and Doorknock; it is not a separate grant.
- **The recommended slice would have been rejected.** The community health
  check was chosen because it is "self-contained, no LLM". That fails twice:
  the review requires an AI-native core ("superficial chatbot add-ons do not
  qualify" — Brume's second rejection), and a run with no `llm.complete` and
  no executa leaves nothing in the server log to count as a Qualified Run
  (forum topic 351: a `storage.set` alone does not count).

---

## The slice: a reading of a pasted CSV for a stated purpose

`src/lib/community-health.ts` stays the spine — pure, no imports; the bundle's
copy is generated from it and a test fails if they drift.

1. Paste or upload a CSV and say what the list is for: reporting to a
   sponsor, sending an email, inviting to an event, handing it over, or a
   general cleanup. Parsing and scoring happen in the window. **Rows never
   leave the iframe.**
2. One `llm.complete` receives the *report only* — scores, check states,
   column names and completeness, findings, and three numbers computed in
   code (unique members, contactable emails, empty-cell share). It writes
   what the person can truthfully say or do with the list for that purpose,
   what goes wrong if they use it as-is, and the order to fix things in.
   That is the part the deterministic report cannot do, and it is the
   server-observable step.
3. A deterministic audit checks every field before it is shown: every number
   must be in the report, every quoted name must be a real column or check,
   and the headline may not restate the score. A failing field is dropped;
   if the claim, the risk or every step fails twice, the report is shown
   with a line saying the reading could not be checked.

Why this and not the others:

| Candidate | Verdict |
|---|---|
| Community health check as shipped | Not AI-native, no qualifying step. Becomes the engine of the slice above |
| Roast my data (`/roast`) | Right voice, wrong weight: script + audio generation on our server is an external dependency the review penalises. Its tone becomes a toggle |
| Free schema health check | Needs a warehouse connection — a stranger cannot complete a run |
| Probe preview | Agent-economy niche; outbound checks from our server |

Paid x402 tools stay out: Anna users have accounts, not wallets.

## Rules carried over from Brume's review rounds

- **Bundle-only.** No executa means no four-platform binaries (first
  rejection) and no chat-tool sampling, which is off after install.
- **Chat opens the window and nothing else.** No tool takes CSV text or
  returns a verdict; tool arguments are model-written and unverifiable.
- **Member emails are personal data.** The model sees aggregates and column
  names only; `samples` in `ColumnReport` must be stripped from the payload.
  Say so on the screen, once.
- **A closed window loses nothing** — checkpoint the parsed report (not the
  rows) before the model call; resume at the reading. Second rejection.
- **Startup is time-boxed and ends in Retry**, never a spinner. Third rejection.
- **The model is the user's choice.** Strict parser, prompts checked against
  Gemini 3 Flash with our own key before any Anna quota is spent.
- `docs/DESIGN.md` mechanical rules apply to the bundle too (no emoji, no
  hardcoded hex); `score-tone.ts` thresholds (80/50) are the one mapping.

## Order and gate

Doorknock goes first (see `doorknock/docs/plan/anna-app-builder.md`): it is
AI-native with no rework and it proves the bundle-only path, the fake-host
test harness and the Cloud Agent checklist once. DataBard reuses all three.
Build this only after Doorknock has passed a review round — the developer
account's Anna quota is spent and each app needs its own fresh-install pass.

- [x] `anna/` bundle — 21 tests + 17 smoke checks, `anna-app validate
      --strict`, one run through the local dev harness
- [x] Browser QA suite, 22 checks (`npm run test:browser`): startup hangs,
      corrupt checkpoints, resume without re-scoring, no rows or sample
      values in the checkpoint or in any model request, quota error, three
      viewports, no non-local requests
- [x] Design pass in the product's dither register: canvas gauge and
      column meters ported from `dither-kit`, pixel icons for check states,
      Space Grotesk bundled, dark and light tokens mirrored from
      `globals.css`; browser QA is now 25 checks
- [x] Truncation: 4,096 tokens with thinking off, one retry at 12,000
- [x] Listing images in `anna/listing/`: real model output (Reflection Beam,
      16 Nov) replayed in a local host. Not captured inside Anna
- [x] Real-model check, 16 Nov (`anna/scripts/prompt-check.mjs`, Reflection
      Beam): 12 of 12 readings passed the audit across three samples, three
      purposes and both tones, with no field dropped; 8 of 12 on the first
      call. The token cap is 4,096 after the reasoning model needed it
- [ ] The same check on Gemini 3 Flash, Anna's default — its quota was
      exhausted on 16 Nov, so the default model is untested
- [x] Published and submitted for review alongside Doorknock, at the
      owner's direction (see Status)
- [ ] Fresh-install Cloud Agent pass once Anna quota is funded

Distribution is the part our numbers do not cover: `docs/GTM.md` measures
pageviews and shares, not sign-ins on another platform. The honest channel is
an "open in Anna" link on `/community` and `/roast` results, and the
audience is community leads with a member export — distinct from the other
two apps' users, which is what a portfolio needs.

## Historical submission, 2026-11-16

**Submitted for review.** App id 939, slug `databard`, review candidate
**v0.1.1** (`version_id=2400`). At submission the status was `pending_review`;
Anna has since rejected this candidate (see Current decision, 2026-11-21).
v0.1.0 was cut first to obtain the app id; v0.1.1 adds the id to the system
prompt addendum and is otherwise identical.

It was submitted without a fresh-install Cloud Agent pass (the developer
account's Anna quota is spent) and without listing images in the Developer
Console — the eight images in `anna/listing/` are ready to upload there. The
local work has since been committed and pushed. A version cut after this point
is not part of any review until `anna-app apps submit-review` is run again.
