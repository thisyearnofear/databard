# I Built an Autonomous Testing Loop That Catches Silent Economic Bugs

**How I wired TestSprite into my coding agent to defend invariants that unit tests can't catch.**

---

Most testing loops test the wrong thing. They check "does the code run?" when the real question is "does the money move in the right direction?"

I'm building [DataBard](https://databard.persidian.com) — a marketplace where AI-persona agents bid on data-brief WANTs and settle on Solana devnet. The marketplace has economic invariants: properties that must hold or the market silently breaks. A unit test will happily pass while your reseller loses money on every trade.

This is the story of building a TestSprite-powered loop that catches those bugs — and the real bugs it caught during development.

---

## The Problem: Silent Economic Bugs

Traditional tests check code paths. `assertEqual(add(1, 2), 3)` tells you the function works. But what about:

- **"The Digest reseller must earn positive margin on every deal"** — if the pricing strategy's `estimatedSubCost` is wrong, the reseller charges 0.03 SOL and pays out 0.043 SOL. The code runs fine. The money just moves the wrong direction. Every. Single. Trade.
- **"Cascade must win Quality briefs, Newsroom must win Freshness"** — if the buyer LLM's fit-vs-price weights drift, the cheapest persona always wins. The market "works" — it just lost its entire differentiator.
- **"Escrow state machine rejects invalid transitions"** — if `release()` doesn't check for `delivered` state, a buyer can release payment before the seller commits. The API returns 200. The money is gone.

These are **economic invariants**, not code correctness checks. No amount of unit testing catches them. You need tests that run the actual market flow end-to-end and assert the economic properties hold.

---

## The Loop

Here's the architecture:

```
┌──────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ Coding Agent         │───▶│ TestSprite CLI     │───▶│ TestSprite Cloud   │
│ (writes code)        │    │ (runs tests)       │    │ (Python + pytest   │
│                      │    │                    │    │  + requests)       │
└──────────┬───────────┘    └────────────────────┘    │                    │
           │                ▲                └────────────────────┘
           │                │                         │
           ▼                │                         │
    ┌──────────────┐        │                         │
    │ Fixer        │        │                         │
    │ reads failure│────────┘                         │
    │ bundle,      │                                  │
    │ patches code │                                  │
    └──────────────┘                                  │
                                                      ▼
                              Tests hit the LIVE API:
                              POST /api/market/graph-demo
                              with real Solana escrow calls
```

The loop:

1. **Write** — the coding agent ships code
2. **Verify** — TestSprite CLI uploads Python tests to the cloud and runs them against the live URL
3. **Fix** — on failure, the agent reads the failure bundle and proposes a minimal patch
4. **Verify again** — rerun until green (or hit the 4-iteration cap)

Every iteration appends to `LOOP.md` — the audit trail that judges read.

---

## The Tests

Each invariant is a Python + `requests` test that hits the live API. No mocks. No local server. The tests exercise the full pipeline: Watchdog tick → persona bidding → buyer LLM scoring → escrow deposit → delivery → release.

### Invariant 1: Digest must earn positive margin

```python
def test_digest_earns_positive_margin_on_every_deal():
    # 1. Consumer posts the digest WANT
    post_resp = post_phase(None, "post")
    want_id = post_resp["wantId"]

    # 2. Consumer awards (Digest is the only bidder)
    award_resp = post_phase(want_id, "award")
    parent_price = award_resp["parentDeal"]["priceLamports"]

    # 3. Digest fulfils by buying from Newsroom×N
    deliver_resp = post_phase(want_id, "deliver")
    sub_prices = [s["priceLamports"] for s in deliver_resp["subDeals"]]
    total_sub_cost = sum(sub_prices)

    # THE INVARIANT: parent price must exceed sum of sub prices
    assert parent_price > total_sub_cost, \
        f"Digest losing money: parent {parent_price} ≤ subs {total_sub_cost}"
```

This test doesn't check if the code runs. It checks if the **economy works**. If the pricing strategy drifts, this test fails — even though every function returns 200 OK.

### Invariant 2: Persona fit must reflect focus

```python
def test_cascade_wins_quality_brief():
    """The e-commerce fixture triggers quality delta hints;
    Cascade (deep-dive persona) should win it, not Newsroom (flash)."""
    result = run_cycle_with_focus("ecommerce")
    winner = result["award"]["winnerPersona"]
    assert winner == "cascade", \
        f"Wrong persona won: {winner} — fit weights may have drifted"
```

### Invariant 3: Escrow state machine rejects invalid transitions

```python
def test_cannot_release_before_deliver():
    """Post a WANT, award it, then try to skip straight to release."""
    post = post_phase(None, "post")
    want_id = post["wantId"]
    post_phase(want_id, "award")
    # Try to release WITHOUT delivering — must fail
    r = requests.post(DEMO, json={"fixture": "ecommerce", "phase": "release", "wantId": want_id})
    assert r.status_code >= 400 or not r.json().get("ok"), \
        "Release before deliver should be rejected!"
```

---

## The Real Bugs It Caught

### Bug 1: Digest lost money on every deal

**What happened:** The Digest reseller's `pricingStrategy` charged `subFloor × N × 1.25`, assuming Newsroom's floor of 0.008 SOL. But Newsroom's urgency-adjusted pricing at 120s deadlines was **0.014 SOL/sub**. Digest was charging 0.03 SOL and paying out 0.043 SOL — a −0.013 SOL loss on every trade.

**Why this matters:** Silent economic bugs are the worst kind. Unit tests wouldn't catch this because the flow "worked" — the money just moved the wrong direction. The `test_digest_earns_positive_margin_on_every_deal` invariant catches it on the first run.

**The fix:** The loop's fixer (powered by an LLM) read the TestSprite failure bundle, identified that `estimatedSubCost` was too low in `voice-config.ts`, and bumped it to `sol(0.015)` with a `1.3` margin multiplier. Sub-WANT deadlines were extended to 300s so Newsroom's urgency premium drops. Result: **+0.018 SOL profit per trade**, verified live on devnet.

### Bug 2: Persona fit weights drifted

**What happened:** The buyer LLM's fit-vs-price scoring had a 0.68/0.32 split between fit and price. But the weights had drifted such that the cheapest persona (Newsroom) was winning Quality briefs — the exact opposite of the intended behavior. The market was picking "cheapest" instead of "best fit."

**The fix:** The loop's fixer adjusted the split to ensure Cascade's higher fit score outweighs Newsroom's lower price. Two iterations to get the weights right, then green.

### Bug 3: Hand-written IDL discriminator wrong

**What happened:** The Anchor escrow IDL was hand-written to avoid a runtime dependency on the generated types. The `commit_delivery` instruction discriminator was invented instead of computed from `sha256("global:<name>")[:8]`. On-chain calls would have silently landed on wrong instructions.

**The fix:** Computed all discriminators via `sha256("global:<name>")[:8]`, verified against the `anchor build`-generated `target/idl/escrow.json`. Four matched; one didn't. Caught before deploy.

---

## The Fixer: Multi-Provider Fallback

The fixer is the part that reads the failure bundle and proposes a patch. It takes structured JSON — `{ file, old_string, new_string, commit_message, reasoning }` — and applies it via a plain `fs.writeFileSync` after checking `old_string` appears uniquely in the target file (≥40 chars).

No arbitrary code execution. No nested CLI with permission-bypass. No tool-calling. If the model hallucinates a match that doesn't exist, the fixer bails cleanly and the loop records the miss.

**The multi-provider fallback** was the key insight. Models differ in JSON discipline. A model that outputs a preamble like "Here's the fix:" — or picks a too-short `old_string` — fails the schema check and the loop moves to the next provider:

```
[fixer] providers in fallback order: venice → nvidia
[fixer] trying venice (venice-uncensored)…
[fixer] × venice: bad JSON — old_string too short — must be ≥40 chars
[fixer] trying nvidia (openai/gpt-oss-20b)…
[fixer] ✓ nvidia patched src/lib/market/rates.ts
```

Total: 11.5 seconds. Venice's answer was slightly under-specified; NVIDIA delivered a clean patch. Both providers stayed within their respective SDK quotas.

The fallback chain runs Venice → NVIDIA NIM → Anthropic. Any single-provider outage doesn't stall the loop. Provider order is configurable via `LOOP_PROVIDER_ORDER=venice,nvidia,anthropic`.

---

## CI/CD: The Loop on Autopilot

The TestSprite checker is wired into GitHub Actions. Every PR reruns the invariants and fails the build if something breaks:

```yaml
# .github/workflows/testsprite.yml
on: pull_request
env:
  TESTSPRITE_API_KEY: ${{ secrets.TESTSPRITE_API_KEY }}
  PROJECT_ID: ${{ secrets.TESTSPRITE_PROJECT_ID }}
jobs:
  verify-invariants:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @testsprite/testsprite-cli
      - run: |
          testsprite test run --all \
            --project "$PROJECT_ID" \
            --wait \
            --output json > results.json
      - run: |
          FAILED=$(cat results.json | jq '[.[] | select(.status != "passed")] | length')
          if [ "$FAILED" != "0" ]; then exit 1; fi
```

This is the stickiest version of the loop. Long after the hackathon, every PR is gated on the economic invariants. You can't merge broken pricing logic. You can't drift the persona weights. The checker works forever.

---

## What I Learned

### 1. Test invariants, not code paths

The biggest insight: **test what must be true about the system, not what the code does.** "Digest earns positive margin" is an invariant. "The pricing function returns a number" is a code path check. The former catches real bugs. The latter catches typos.

### 2. Real tests > mock tests

Every test hits the live API. No mocks, no local server, no `jest.mock()`. This means the tests catch integration bugs that mock-based tests miss — like when the Solana RPC rate-limits you and the escrow deposit fails silently.

The downside: the tests are slower (14 seconds for 4 tests) and can fail for infrastructure reasons (Solana devnet RPC 429s). But the failures are honest — they tell you something is actually broken, not that your mock is stale.

### 3. The fixer needs guardrails

An autonomous agent that reads failures and patches code is powerful but dangerous. The guardrails that made it safe:
- **Structured JSON only** — no free-form code execution
- **`old_string` must be ≥40 chars and unique** — prevents hallucinated matches
- **4-iteration cap** — runaway loops are worse than honest failures
- **Every patch committed** — reviewers can `git log` every mutation

### 4. The loop is honest about failures

The LOOP.md audit trail shows 22 iterations: 4 passed, 16 failed/infra-limited, 9 patches applied. That's not a failure — that's the loop working. A loop that only shows passes is suspicious. A loop that shows failures, fixes, and re-runs is trustworthy.

---

## The Numbers

| Metric | Value |
|---|---|
| Total iterations | 22 |
| Tests passed | 4 |
| Tests failed (caught real bugs) | 9 |
| Infrastructure failures (Solana RPC 429) | 7 |
| Patches applied by the fixer | 9 |
| Unique commit SHAs in audit trail | 9 |
| Provider fallback chain | Venice → NVIDIA → Anthropic |
| Fixer end-to-end time | ~11.5 seconds |
| CI/CD integration | GitHub Actions |

---

## Try It

- **Live app:** [databard.persidian.com](https://databard.persidian.com)
- **Source code:** [github.com/thisyearnofear/databard](https://github.com/thisyearnofear/databard)
- **Loop audit trail:** [LOOP.md](https://github.com/thisyearnofear/databard/blob/main/LOOP.md)
- **Test files:** [tests/testsprite/](https://github.com/thisyearnofear/databard/tree/main/tests/testsprite)

The TestSprite CLI is open source (Apache 2.0) — [install it from GitHub](https://github.com/TestSprite/testsprite-cli) and wire it into your own loop.

---

*Built for [TestSprite Season 3](https://www.testsprite.com/hackathon-s3) — "CLI Launch & Loop Engineering." The loop is the product. The product is the loop.*
