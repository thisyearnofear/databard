# Anna Founding Builder Program — DataBard plan

**Program:** Anna (Anima AI OS) × DoraHacks — <https://dorahacks.io/hackathon/2349/detail> ·
rules: [forum topic 205](https://forum.anna.partners/t/turn-your-ai-agents-apps-into-recurring-monthly-grants-join-the-anna-ai-os-founding-builder-program-up-to-80k-month-pool/205)
(read 2026-11-16) · developer docs: <https://anna.partners/llms-full.txt>.
Review lessons come from Brume on the same builder account
(`brume/docs/ANNA.md` §12).

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

## Status, 2026-11-16

**Submitted for review.** App id 939, slug `databard`, review candidate
**v0.1.1** (`version_id=2400`), status `pending_review`. v0.1.0 was cut first
to obtain the app id; v0.1.1 adds the id to the system prompt addendum and is
otherwise identical.

Submitted without a fresh-install Cloud Agent pass (the developer account's
Anna quota is spent) and without listing images in the Developer Console —
the eight images in `anna/listing/` are ready to upload there. Local work is
uncommitted. A version cut after this point is not part of the review until
`anna-app apps submit-review` is run again.
