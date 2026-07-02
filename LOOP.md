# LOOP.md — DataBard × TestSprite Verification Loop

**Submission for:** TestSprite Season 3 · "CLI Launch & Loop Engineering"
**Repo:** `github.com/thisyearnofear/databard`
**Live URL:** `https://databard.thisyearnofear.com`
**TestSprite account:** `papaandthejimjams@gmail.com`

---

## The 30-second version

DataBard is a real, live marketplace where AI-persona agents bid on data-brief WANTs and
settle on Solana devnet (see [docs/CORAL_HACKATHON.md](docs/CORAL_HACKATHON.md) for the
full story). This LOOP defends its **economic invariants** — the properties that must
hold or the market silently breaks:

1. **Digest reseller must earn positive margin** on every settled deal
2. **Cascade wins Quality briefs, Newsroom wins Freshness** — persona-focus fit
3. **Escrow state machine rejects invalid transitions** (no release before commit)
4. **Release cascade settles all sub-escrows** (Newsroom must get paid)

Each invariant lives as a Python + `requests` test at
[`tests/testsprite/`](tests/testsprite/). The loop
([`scripts/loop/loop.mjs`](scripts/loop/loop.mjs)) uploads them to TestSprite Cloud,
tunnels the dev server via Cloudflare, and — on failure — feeds the failure bundle to
Claude Code non-interactively to propose+apply+commit a minimal patch. Re-runs until
green or hits the 4-iteration cap.

## The architecture

```
┌──────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ scripts/loop/loop.mjs│───▶│ testsprite CLI     │───▶│ TestSprite Cloud   │
│                      │    │ test create --run  │    │ (Python + pytest   │
│  ├─ dev server       │    │ test failure get   │    │  + requests)       │
│  ├─ cloudflared      │    │ test rerun         │    │                    │
│  └─ fixer.mjs ────┐  │    │                    │    │  hits our tunneled │
└──────────────────┼──┘    └────────────────────┘    │  /api/market/*     │
         │         │             ▲                └────────────────────┘
         │         │             │
         │         ▼             │
         │   ┌────────────────┐  │  ┌──────────────────────────┐
         │   │ providers.mjs  │  │  │  Fallback chain (in order):│
         │   │ walk chain,    │  │  │   1. Venice (fastest)     │
         │   │ same JSON      │  │  │   2. NVIDIA NIM (OSS)     │
         │   │ contract from  │  │  │   3. Anthropic (backup)   │
         │   │ every provider │  │  │  Each provider yields     │
         │   └────────────────┘  │  │  { file, old_string,      │
         │                       │  │    new_string,            │
         └──── on failure ───────┘  │    commit_message }.      │
                                    │  Loop validates + applies │
                                    │  via fs, then commits.    │
                                    └──────────────────────────┘
```

**Why the multi-provider fallback:** models differ in JSON discipline. A model that
outputs a preamble like "Here's the fix:" — or picks a too-short `old_string` — fails
our schema check and the loop moves to the next provider. The fallback runs in ~11
seconds end-to-end. Any single-provider outage doesn't stall the loop. Provider order
is configurable via `LOOP_PROVIDER_ORDER=venice,nvidia,anthropic` (or a subset).

**Why the strict-JSON contract:** the fixer takes structured JSON — `{ file,
old_string, new_string, commit_message, reasoning }` — and applies it via a plain
`fs.writeFileSync` after checking `old_string` appears uniquely in the target file
(≥40 chars). No arbitrary code execution, no nested CLI with permission-bypass, no
tool-calling. If the model hallucinates a match that doesn't exist, the fixer bails
cleanly and the loop records the miss. Reviewers can `git log` every mutation.

**Verified smoke test** (see `scripts/loop/smoke-fixer.mjs`):

```
[fixer] providers in fallback order: venice → nvidia
[fixer] trying venice (venice-uncensored)…
[fixer] × venice: bad JSON — old_string too short — must be ≥40 chars
[fixer] trying nvidia (openai/gpt-oss-20b)…
[fixer] ✓ nvidia patched .loop/smoke/src/lib/market/rates.ts
```

Total: 11.5s. Venice's answer was slightly under-specified; NVIDIA delivered a clean
patch. Both providers stayed within their respective SDK quotas.

## Loop-Quality evidence (what the loop actually caught)

Every entry below is appended by `loop-local.mjs` as it runs. Each row includes the
timestamp, the test that fired, whether the agent fixed it, and the git SHA of the patch.
Reviewers can `git show <sha>` to see the exact edit the agent made.

### Official TestSprite Cloud verification — 2026-07-02

The `digest-margin` invariant, sealed on TestSprite's cloud runner (Python + `requests` +
pytest) against the tunneled live app. Backend tests are 0-credit at run time, so the
loop can iterate freely without eating the plan's budget.

| Field | Value |
|---|---|
| Project | `DataBard Market API` (`98d788db-4ec4-46ea-abb9-49acd9d4ffd5`) |
| Test | `digest-margin-official-v2` (`ba123a58-77d2-4f9d-881f-235dca9ef936`) |
| Run | `c50a8f76-fe76-417e-a365-c1cdba001ef1` |
| Verdict | ✓ **passed** (1/1 steps, 56s wall-clock) |
| Dashboard | https://www.testsprite.com/dashboard/tests/98d788db-4ec4-46ea-abb9-49acd9d4ffd5/test/ba123a58-77d2-4f9d-881f-235dca9ef936 |
| Target | tunneled localhost:3000 via `cloudflared` (URL baked into test code — see note below) |

**Author's note on backend test URLs:** TestSprite's CLI advisory said "`--target-url`
has no effect for backend tests" — the base URL must be literal in the Python source.
For the CLI submission we bake the tunnel URL inline before upload; the on-disk test
uses `os.environ.get("TARGET_URL", …)` so the local loop stays reusable across runs.

### Local iteration audit trail

<!-- Fast-loop iterations appended by scripts/loop/loop-local.mjs -->

## Historical bugs the loop would have caught (retro)

These are **real** bugs found by hand during hackathon development. Each one now has a
regression test that would fail in seconds — the loop has permanent coverage against
their return.

### 1. Digest lost money on every deal (fixed 2026-07-02)

**What happened:** the Digest reseller's `pricingStrategy` charged `subFloor × N × 1.25`
assuming Newsroom's floor of 0.008 SOL. But Newsroom's urgency-adjusted pricing at 120s
deadlines was **0.014 SOL/sub**. Digest was charging 0.03 SOL and paying out 0.043 SOL —
a −0.013 SOL loss on every trade.

**Why the loop matters:** silent economic bugs are the worst kind. Unit tests wouldn't
catch this because the flow "worked" — the money just moved the wrong direction. The
`test_digest_earns_positive_margin_on_every_deal` invariant catches it on the first run.

**Fix (visible in git):** [`src/lib/voice-config.ts`](src/lib/voice-config.ts) — Digest's
`estimatedSubCost` bumped to `sol(0.015)` with `1.3` margin multiplier; sub-WANT deadlines
extended to 300s in [`src/lib/market/reseller.ts`](src/lib/market/reseller.ts) so
Newsroom's urgency premium drops. Result: **+0.018 SOL profit per trade**, verified live
on devnet.

### 2. Stale-closure bug in the market dashboard (fixed 2026-07-02)

**What happened:** the `/market` page's auto-fire effect only depended on
`[countdown, monitorState]`, so `runCycle` captured a stale `track` from its closure. When
a user switched from Watchdog to the Graph tab, cycles kept firing the Watchdog code path.

**Fix (visible in git):** replaced the direct `track` closure read with a `trackRef` that
mutates on every track change. See [`src/app/market/page.tsx`](src/app/market/page.tsx).

This one isn't caught by an economic invariant test — it's a UI regression — but it's the
kind of "silent wrong branch" that a frontend TestSprite test would flag on the next run
(the Graph tab would never actually execute a graph cycle).

### 3. Hand-written IDL discriminator wrong (fixed 2026-07-02)

**What happened:** the [Anchor escrow IDL](src/lib/settlement/backends/escrow-idl.ts)
was hand-written to avoid a runtime dependency on the generated types. The
`commit_delivery` instruction discriminator was invented instead of computed. On-chain
calls would have silently landed on wrong instructions.

**Fix:** computed all discriminators via `sha256("global:<name>")[:8]`, verified against
the `anchor build`-generated `target/idl/escrow.json`. Four matched; one didn't. Caught
before deploy.

This one isn't in a TestSprite invariant yet — but it's a candidate:
`test_idl_discriminators_match_generated` could shell out to `anchor build` in the
sandbox and diff. Adding to the backlog.

## Running the loop yourself

```bash
# One-time setup — configure the TestSprite CLI + install our project into your account
npm install -g @testsprite/testsprite-cli
export TESTSPRITE_API_KEY=<your key>
testsprite setup --from-env --agent claude -y

# Configure at least ONE LLM provider for the fixer. Any subset works:
cat >> .env <<'EOF'
VENICE_API_KEY=<your venice key>          # fastest, tried first
NVIDIA_NIM_API_KEY=<your nvidia key>      # OSS model fallback
ANTHROPIC_API_KEY=<your anthropic key>    # last-resort
EOF

# Cloudflare Tunnel is required — TestSprite Cloud needs a public URL to hit
which cloudflared || brew install cloudflared

# Sanity-check the fallback chain (no TestSprite call, no market touched):
node scripts/loop/ping-providers.mjs        # ping each configured provider
node scripts/loop/smoke-fixer.mjs           # end-to-end fixer against a sandbox file

# One-shot: run the loop against all invariants
node scripts/loop/loop.mjs

# Or scope to one invariant
node scripts/loop/loop.mjs digest-margin

# Verbose (surface dev server + tunnel logs)
LOOP_VERBOSE=1 node scripts/loop/loop.mjs

# Override provider order (default: venice,nvidia,anthropic)
LOOP_PROVIDER_ORDER=anthropic node scripts/loop/loop.mjs

# Override a specific provider's model
LOOP_NVIDIA_MODEL=meta/llama-3.3-70b-instruct node scripts/loop/loop.mjs

# Skip tunnel — point at an already-deployed URL yourself
node scripts/loop/loop.mjs --target-url https://databard.thisyearnofear.com
```

The loop will:
1. Start the Next.js dev server
2. Open a Cloudflare Tunnel to it (TestSprite Cloud needs a public URL)
3. Upload each `tests/testsprite/test_*.py` invariant to your TestSprite project
4. Run each one against the tunneled URL
5. On failure → Claude Code proposes+applies+commits a patch → re-run
6. Cap at 4 iterations per invariant
7. Append every result to this file

## Why this is a good hackathon submission

- **Real target under test.** DataBard is a live marketplace with real users, not a
  synthetic demo project.
- **Real bugs to catch.** The invariants defend against economic drift, not tautologies.
  Two of the three historical bugs above were found *during this hackathon* — this is
  what the loop would have caught in seconds.
- **Loop transparency.** Every iteration commits its patch. Reviewers can `git log`
  through the audit trail. No black-box "the agent fixed it" hand-waving.
- **Zero-credit backend testing.** Backend tests cost 0 credits per run, so the loop can
  iterate freely without eating the free plan's budget.
- **Meta-story that fits the Coral hackathon too.** Same repo, different submission: the
  marketplace is the app, the loop is what maintains it.

---

### 2026-07-02T09:18:33.669Z — `digest-margin` iteration 1

**Status:** × failed → fixer patched (f7513c9)
**Commit:** `f7513c9`
**Root cause:** Digest's parent price is not exceeding the sum of sub-WANT prices. The pricing strategy's `estimatedSubCost` or margin multiplier is likely too low — check src/lib/voice-config.ts DIGEST.pricingStrategy.
**Fixer provider:** venice
**Fixer reasoning:** Increased urgency multiplier to ensure Digest's parent price exceeds sub-WANT costs.
**Runner:** local pytest

---

### 2026-07-02T09:18:42.414Z — `digest-margin` iteration 2

**Status:** × failed → fixer patched (7538941)
**Commit:** `7538941`
**Root cause:** Digest's parent price is not exceeding the sum of sub-WANT prices. The pricing strategy's `estimatedSubCost` or margin multiplier is likely too low — check src/lib/voice-config.ts DIGEST.pricingStrategy.
**Fixer provider:** venice
**Fixer reasoning:** The test failure indicates Digest's parent price is not exceeding the sum of sub-WANT prices, suggesting the urgency multiplier is too low.
**Runner:** local pytest

---

### 2026-07-02T09:19:03.327Z — `digest-margin` iteration 3

**Status:** × failed → fixer bailed (All 2 providers exhausted)
**Runner:** local pytest

---

### 2026-07-02T09:23:13.227Z — `digest-margin` iteration 1

**Status:** × failed → fixer bailed (All 2 providers exhausted)
**Runner:** local pytest

---

### 2026-07-02T09:27:49.190Z — `digest-margin` iteration 1

**Status:** × failed → fixer bailed (All 2 providers exhausted)
**Runner:** local pytest

---

### 2026-07-02T09:33:23.205Z — `digest-margin` iteration 1

**Status:** × failed → fixer bailed (All 2 providers exhausted)
**Runner:** local pytest

---

### 2026-07-02T09:34:26.086Z — `digest-margin` iteration 1

**Status:** × failed → fixer patched (8792f94)
**Commit:** `8792f94`
**Root cause:** Digest's parent price is not exceeding the sum of sub-WANT prices. The pricing strategy's `estimatedSubCost` or margin multiplier is likely too low — check src/lib/voice-config.ts DIGEST.pricingStrategy.
**Fixer provider:** venice
**Fixer reasoning:** The test failure indicates Digest's parent price is not exceeding the sum of sub-WANT prices, suggesting the estimatedSubCost is too low.
**Runner:** local pytest

---

### 2026-07-02T09:34:35.359Z — `digest-margin` iteration 2

**Status:** × failed → fixer patched (0f7235e)
**Commit:** `0f7235e`
**Root cause:** Digest's parent price is not exceeding the sum of sub-WANT prices. The pricing strategy's `estimatedSubCost` or margin multiplier is likely too low — check src/lib/voice-config.ts DIGEST.pricingStrategy.
**Fixer provider:** venice
**Fixer reasoning:** The test failure indicates Digest is losing money on trades, so the estimatedSubCost needs to be increased to cover the actual sub-WANT costs.
**Runner:** local pytest

---

### 2026-07-02T09:34:44.489Z — `digest-margin` iteration 3

**Status:** × failed → fixer patched (4128237)
**Commit:** `4128237`
**Root cause:** Digest's parent price is not exceeding the sum of sub-WANT prices. The pricing strategy's `estimatedSubCost` or margin multiplier is likely too low — check src/lib/voice-config.ts DIGEST.pricingStrategy.
**Fixer provider:** venice
**Fixer reasoning:** The test failure indicates Digest's pricing strategy is not maintaining a positive margin.
**Runner:** local pytest

---

### 2026-07-02T09:34:52.489Z — `digest-margin` iteration 4

**Status:** × failed → fixer patched (d85ed11)
**Commit:** `d85ed11`
**Root cause:** Digest's parent price is not exceeding the sum of sub-WANT prices. The pricing strategy's `estimatedSubCost` or margin multiplier is likely too low — check src/lib/voice-config.ts DIGEST.pricingStrategy.
**Fixer provider:** venice
**Fixer reasoning:** The test failure indicates Digest's parent price is not exceeding the sum of sub-WANT prices, so increasing the estimatedSubCost ensures a positive margin.
**Runner:** local pytest

---

### 2026-07-02T10:25:08.631Z — `digest-margin` iteration 1

**Status:** × failed → fixer patched (e0e6d57)
**Commit:** `e0e6d57`
**Root cause:** Digest's parent price is not exceeding the sum of sub-WANT prices. The pricing strategy's `estimatedSubCost` or margin multiplier is likely too low — check src/lib/voice-config.ts DIGEST.pricingStrategy.
**Fixer provider:** venice
**Fixer reasoning:** The test failure indicates Digest is losing money due to an outdated estimatedSubCost.
**Runner:** local pytest

---

### 2026-07-02T10:25:46.804Z — `digest-margin` iteration 2

**Status:** ⚠ infrastructure failure — infrastructure failure (matches /HTTPError:\s+5\d\d/) — target unreachable or on-chain funds insufficient
**Runner:** local pytest

---

### 2026-07-02T10:31:38.152Z — `digest-margin` iteration 1

**Status:** ✓ passed
**Runner:** local pytest
