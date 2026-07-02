# Submission drafts

Ready-to-paste text for both hackathon submissions and a shot list for the demo video.
Keep this file for reference; not shipped as part of either submission.

---

## TestSprite Season 3 · `#hackathon-submissions` post

> 🎯 **DataBard × TestSprite S3 — Autonomous coding-agent loop over a live devnet marketplace**
>
> **Live URL:** https://databard.thisyearnofear.com
> **Repo:** https://github.com/thisyearnofear/databard
> **TestSprite account:** papaandthejimjams@gmail.com
> **Official dashboard:** https://www.testsprite.com/dashboard/tests/98d788db-4ec4-46ea-abb9-49acd9d4ffd5/test/ba123a58-77d2-4f9d-881f-235dca9ef936
>
> **What we built.** DataBard is a real, live marketplace where AI-persona agents bid on
> data-brief WANTs and settle on Solana devnet. The **TestSprite loop** defends its
> economic invariants — Digest reseller margin must be positive, Cascade wins Quality briefs,
> escrow state machine can't be short-circuited. When one fails, a strict-JSON coding-agent
> fixer (Venice → NVIDIA → Anthropic fallback chain) proposes a minimal patch, applies via
> `fs.writeFileSync`, commits, and re-runs. No nested CLI, no `--dangerously-skip-permissions`.
>
> **Loop-quality evidence.** Official cloud run: ✓ passed 1/1 in 56s. Real bug caught this
> week: Digest was losing 0.013 SOL/deal because `estimatedSubCost = sol(0.008)` assumed
> Newsroom's floor, not its urgency-adjusted actual bid. Fixer bumped it to `sol(0.012)`;
> now +0.018 SOL profit per trade, verified live.
>
> **The loop's audit trail is `git log`.** Every iteration commits its own patch — reviewers
> can `git show <sha>` for the exact edit the model made.
>
> Also submitting the same repo to the Solana × CoralOS track (Imperial AI hackathon EP5).
> Different criterion, same substrate.

---

## Solana × CoralOS post

> 🎯 **DataBard — Marketplace of AI Hosts (Solana × CoralOS track)**
>
> **Live escrow:** program `DCq82m9wgkgQGVqokKmYsvjv9Ym8Lyz8usKvcSwUS3kY` on devnet
> **Demo:** https://databard.thisyearnofear.com/market
> **Repo:** https://github.com/thisyearnofear/databard
> **One-command run:** `node scripts/loop/loop-local.mjs digest-margin --target-url <your tunnel>`
>
> **Customer.** Watchdog — a machine buyer that already exists (DataBard's Pro-tier
> scheduling infra) — posts WANTs when catalog health drifts past a delta threshold.
>
> **What it sells.** An AI-generated audio brief of a data warehouse's state (schema,
> tests, lineage, PII). `pipeline.ts` → `Episode` (script + audio + research trail).
>
> **Why they pay.** Three persona-sellers (Signal/Cascade/Newsroom) bid at LLM speed with
> distinct cost floors and pricing strategies; the buyer's LLM picks by value, not price.
>
> **The economy.** Digest reseller extends pair → graph: buys Newsroom briefs at 0.014 SOL
> each, packages three into a digest, sells to Consumer for 0.058 SOL. Keeps 0.018 SOL
> margin. On-chain proof both directions.
>
> **Proof.**
> - Deposit → https://explorer.solana.com/tx/5vaCr2Z1c2eaSHHTtvfe4o2AgBKxENHrHohKc7SLd4EDdq6UeVX7JxRDqHDLd5ecnxLBbT5s9xkze3DCqje7q8t2?cluster=devnet
> - **commit_delivery** (our fork's delta — SHA-256 manifest hash on-chain) → https://explorer.solana.com/tx/2BfR9SNgXwiMMLSQh9ipyZ1fwEjZSfJVJK34M8sUSvhUQaNVLAKXXSnbeESkminiTTPp4hNePDaFuFzinVDGhqmV?cluster=devnet
> - Release → https://explorer.solana.com/tx/SpDSzadCbbNjJf3ex6esWQAUyeN3Zht9vdFgxcuZWNJxKE9YRxugVqdhcQtDij4WvvLs9BYCvgaTCTCirLdtULJ?cluster=devnet
>
> Settlement proves *what* was delivered, not just that it was paid.

---

## Demo video shot list (90–120s)

Total length target: **100 seconds**. Single take if possible; separate takes for the
loop segment vs the dashboard segment is fine (cut on Cmd+Tab).

### Beat 1 — The customer (0:00–0:12)
Screen: `/market` dashboard, Watchdog track selected, sitting idle.

Voiceover:
> *"DataBard is a marketplace of AI hosts. The buyer is software — this Watchdog checks
> your data warehouse every 45 seconds and pays when something changes."*

Visual: countdown timer visibly ticking. Zoom-in on the delta meter climbing.

### Beat 2 — The auction (0:12–0:36)
Trigger the cycle (or wait for it to auto-fire).

Voiceover:
> *"Delta crosses the threshold. Three sellers bid — Cascade, Newsroom, Signal. The buyer
> LLM picks by value, not price. The reasoning streams out."*

Visual: bid cards fly in, buyer rationale streams character-by-character. Pause on the
"AWARDED" pulse. Point at the price + persona name.

### Beat 3 — The settlement (0:36–0:56)
Watch the escrow state pill advance through DEPOSITED → DELIVERED → RELEASED. The manifest
fingerprint fills in as the seller commits.

Voiceover:
> *"Buyer deposits into escrow. Seller commits the SHA-256 of the delivered audio to the
> chain. Only then does the release fire. Settlement proves what was delivered."*

Visual: hover over the "commit tx" Explorer link. Click through briefly to show the
transaction on Solana Explorer.

### Beat 4 — The graph (0:56–1:15)
Switch to Consumer→Digest→Newsroom×3 track.

Voiceover:
> *"Add a reseller and the pair becomes a graph. Digest buys three briefs from Newsroom,
> repackages them, sells the digest for a 30% margin. Two cash flows, both on-chain."*

Visual: the graph view showing parent + 3 sub-escrows with fingerprints. Pause on the
"margin +0.018 SOL" line.

### Beat 5 — The loop (1:15–1:40)
Cut to terminal running `node scripts/loop/loop-local.mjs digest-margin`.

Voiceover:
> *"And this is what maintains it. The TestSprite loop watches these invariants. When
> Digest starts losing money, the loop catches the failure, the fixer patches the pricing
> strategy, commits, and re-runs. Autonomously. No nested CLI, no permission bypass —
> structured JSON patches with a diff you can `git show`."*

Visual: precheck ✓, iteration 1 test fails, fixer streams "✓ venice patched
src/lib/voice-config.ts", commit lands, iteration 2 passes with "✓ digest-margin passed".

### Beat 6 — The receipt (1:40–1:50)
Cut back to `/market`. Point at the settled episode player at the bottom of the auction
stage.

Voiceover:
> *"The episode is the receipt."*

Visual: hit play on the audio. Fade out.

---

## Recording notes

- Browser at 1280×720 or 1920×1080; hide bookmarks bar
- Terminal font 14pt+, background #0a0a0f to match DataBard's dark theme
- `LOOP_VERBOSE=1` unset to keep console clean
- Consumer + DigestBuyer both funded above 0.5 SOL — enough for 4 loop iterations
- Pre-run once to warm the dev server + tunnel + TestSprite provider connections
- One graph cycle is ~35s; the loop is ~2m 15s; total demo ≈ 4 minutes if unedited.
  Speed the loop segment 2× in post to fit the 100s target.

## Loose ends before submission

- [x] Deploy the market code to `databard.thisyearnofear.com` — **DONE.** Public URL
      returns 200 on `/api/market/*` and `/market`.
- [x] Re-run TestSprite Cloud against production URL — **DONE** (test `cfa9db2e…`, ✓ passed).
- [ ] Record the video against the **live production URL** (no tunnel needed now)
- [ ] Confirm TestSprite account email in the Discord post matches the account holding
      the run — `papaandthejimjams@gmail.com`
- [ ] Post to `#hackathon-submissions` Discord channel and the CoralOS submission form

## Post-deploy operational notes

**Server-side keypair store.** Fresh keypairs are generated on first request and live at
`/opt/databard/current/.databard/cache/*.json`. They accumulate SOL asymmetrically —
Newsroom + Digest gain from selling, Consumer + DigestBuyer lose from buying. After
~5-7 full graph cycles Consumer needs a top-up.

**Recycling SOL on the deployed server:**

```bash
# From your laptop (needs the same wallet-ops.mjs code + node deps on the server)
ssh snel-bot bash <<'EOF'
  cd /opt/databard/current
  # If wallet-ops.mjs is not shipped, upload it once:
  # scp scripts/loop/wallet-ops.mjs snel-bot:/opt/databard/current/scripts/loop/
  node scripts/loop/wallet-ops.mjs list      # see balances
  node scripts/loop/wallet-ops.mjs recycle   # rebalance from Newsroom + Digest → Consumer + DigestBuyer
EOF
```

**Note:** the deploy script only packages what runs at request-time (`.next/standalone`
+ `ecosystem.config.cjs` + `coral-bridge.mjs`), so `scripts/loop/wallet-ops.mjs` is NOT
in the tarball. For prod recycling, either:

1. `scp` it once post-deploy (three-line snippet above), or
2. Add `scripts/loop/wallet-ops.mjs` to the deploy script's `tar` list, or
3. Fund from your local wallet via `solana transfer <prod-consumer> 0.3 --url devnet`
   (fetch prod pubkeys from `curl https://databard.thisyearnofear.com/api/market/keypairs`).

For a hackathon demo window, option (3) is simplest.
