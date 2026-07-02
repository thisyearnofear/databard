# DataBard × Solana × CoralOS — Marketplace of AI Hosts

> **Submission for:** UK AI Agent Hackathon EP5 × Conduct — Solana × CoralOS track
> **Theme:** Agents that earn. Build the thing they buy, and how they compete for it.
> **Prize:** Total $5,000 (1st: $3,000, 2nd–5th: $500)

## Status

**Live on devnet.** Program `DCq82m9wgkgQGVqokKmYsvjv9Ym8Lyz8usKvcSwUS3kY`.

Proven end-to-end (see [tests/smoke.ts](../contracts/escrow/tests/smoke.ts) output in commit log):
- deposit → [Explorer](https://explorer.solana.com/tx/5vaCr2Z1c2eaSHHTtvfe4o2AgBKxENHrHohKc7SLd4EDdq6UeVX7JxRDqHDLd5ecnxLBbT5s9xkze3DCqje7q8t2?cluster=devnet)
- commit_delivery (fork's delta — manifest hash on-chain) → [Explorer](https://explorer.solana.com/tx/2BfR9SNgXwiMMLSQh9ipyZ1fwEjZSfJVJK34M8sUSvhUQaNVLAKXXSnbeESkminiTTPp4hNePDaFuFzinVDGhqmV?cluster=devnet)
- release → [Explorer](https://explorer.solana.com/tx/SpDSzadCbbNjJf3ex6esWQAUyeN3Zht9vdFgxcuZWNJxKE9YRxugVqdhcQtDij4WvvLs9BYCvgaTCTCirLdtULJ?cluster=devnet)

---

## Product story (one sentence)

**DataBard is a marketplace where AI hosts bid to brief you on your data. Humans buy via wallet or card; agents post WANTs on cadence; every episode settles on Solana, and mints become on-chain seller reputation.**

Everything below serves that sentence.

## Why this is additive, not a fork of the product

DataBard already ships every ingredient the hackathon asks for. The work here makes the marketplace *explicit* — it doesn't build one from scratch.

| Hackathon requirement | Already in DataBard | Delta |
|---|---|---|
| `deliverService()` returning a paid artifact | `pipeline.ts` → `Episode` (script + audio + research trail + optional music) | Wrap as canonical delivery entry point |
| Seller personas competing to sell | `voice-config.ts` (Alex/Morgan voice styles) + `script-generator.ts` (two-host personas) | Extend into three named sellers with cost floor + pricing strategy |
| LLM buyer picking best value | `research.ts` / evidence providers already score data-quality signals the buyer would use | New `market/buyer.ts` reuses evidence to judge bids |
| Solana settlement | `api/checkout/palmusd/*` (SPL transfer + on-chain verify) + `api/onchain/mint-solana` | Generalize verify into escrow release; mint on settle |
| On-chain reputation | Leaderboard + team-history + mint registry are already live | Reputation feeds bid weighting; no new store |
| Machine buyer | `api/schedules` + Pro-tier scheduled regeneration is already a recurring "buyer" of episodes | Delta-trigger a WANT to the market on catalog health change |
| Public API for external agents | `pipeline.ts` is a pure function today; already callable | Add `/api/market/want` as the public entry |

**No parallel product. One narrative arc: what DataBard sells, and how agents come to buy it.**

## Core principles (reference)

Every design decision below is justified against these.

- **Enhancement first** — extend existing modules over creating new ones
- **Consolidation** — delete, don't deprecate
- **Prevent bloat** — audit before adding
- **DRY** — single source of truth
- **Clean** — explicit dependencies, separation of concerns
- **Modular** — composable, testable
- **Performant** — adaptive loading and caching
- **Organized** — predictable, domain-driven file structure

## Architecture

```
src/lib/
  voice-config.ts       ── EXTEND: personas gain { costFloor, pricingStrategy, publicKey }
                            Signal (executive brief, premium), Cascade (deep-dive, mid),
                            Newsroom (breaking-changes flash, discount)
  pipeline.ts           ── UNCHANGED body; becomes canonical deliverService()
                            Accepts optional deal ref; stamps episode with escrow ref on delivery
  research-session.ts   ── EXTEND: ResearchSessionBranch gains { deal?: DealRef }
  types.ts              ── EXTEND: Want / Bid / Award / Deal / DealRef added to shared domain

  market/
    protocol.ts         ── NEW: Want/Bid/Award/Deal state machine + validation
                            Single source of truth for market lifecycle
    sellers.ts          ── NEW: internal persona sellers + external seller registry
                            Reads personas from voice-config; hybrid design
    buyer.ts            ── NEW: LLM buyer strategy — value not cheapest, budget-enforced
                            Reused by Watchdog AND documented as reference for external buyers
    watchdog.ts         ── NEW: delta-triggered WANT poster
                            Reads catalog health snapshots; posts on threshold breach

  settlement/
    verifier.ts         ── NEW: one interface, three backends (escrow / pusd / stripe)
    backends/
      escrow.ts         ── NEW: Solana escrow wrapper (calls forked program)
      pusd.ts           ── EXTRACT from api/checkout/palmusd/verify
      stripe.ts         ── EXTRACT from api/webhook

src/app/api/
  market/
    want/route.ts        ── NEW: public POST — external agents post WANTs here
    bids/route.ts        ── NEW: GET (SSE) live bids for dashboard
    award/route.ts       ── NEW: buyer picks bid → escrow deposit
    deliver/route.ts     ── NEW: seller triggers pipeline → escrow release
  checkout/
    palmusd/verify/     ── SHRINK: route delegates to settlement/verifier.ts
  webhook/              ── SHRINK: route delegates to settlement/backends/stripe.ts

src/app/market/          ── NEW: live auction dashboard
                            Reuses episode player as "settlement receipt"
                            Explorer links inline at every state transition

contracts/escrow/        ── FORKED from starter kit:
                            Adds deliverable_hash: Option<[u8;32]> to escrow account
                            New instruction commit_delivery(escrow, hash)
                            release() gates on committed hash — cryptographic delivery proof
```

## The forked escrow — what "customized" means

The starter kit escrow gives us WANT → BID → AWARD → DEPOSITED → DELIVERED → RELEASED. That's the settlement spine.

**Delta**: extend the escrow account with a `deliverable_hash: Option<[u8; 32]>` field and one new instruction:

```rust
// Seller commits the SHA-256 of the episode manifest before requesting release.
// The buyer's client verifies the audio it downloaded matches this hash.
// If the hash doesn't match delivery, the buyer can dispute before release.
pub fn commit_delivery(ctx: Context<CommitDelivery>, hash: [u8; 32]) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    require!(escrow.state == EscrowState::Deposited, EscrowError::InvalidState);
    require!(ctx.accounts.seller.key() == escrow.seller, EscrowError::Unauthorized);
    escrow.deliverable_hash = Some(hash);
    escrow.state = EscrowState::Delivered;
    Ok(())
}
```

Then `release()` requires `deliverable_hash.is_some()`. The commitment cost is one instruction; the story it unlocks is that the settlement isn't just "paid" — it **proves what was delivered.** That's the winning slide.

## Personas (the three sellers)

Extension of `voice-config.ts`. Each persona is a seller with:

- Voice ID (existing)
- **Cost floor** in lamports (new)
- **Pricing strategy**: `(want, contextSize, urgency) => lamports` (new)
- **Bid reasoning template** (new, one-line LLM prompt)
- **Solana keypair** for signing bids (new, generated at boot for demo)

| Persona | Voice | Style | Cost floor (dev) | Strategy |
|---|---|---|---|---|
| **Signal** | George (calm executive) | Executive brief — 60s, headline-level | 0.05 SOL | Premium; bids higher on small schemas + high-priority WANTs |
| **Cascade** | Sarah (thorough auditor) | Deep-dive — 3–5 min, drills into failures | 0.02 SOL | Mid; bids higher when failing tests or lineage risk present |
| **Newsroom** | Charlotte (breaking news) | Flash — 45s, only what changed since last brief | 0.01 SOL | Discount; bids lowest, wins on tight budgets and delta-triggered WANTs |

The buyer's LLM sees each bid alongside its reasoning and price, and picks the one whose *fit* to the WANT is best, not just the cheapest. Budget is a fixed per-brief cap in the demo (rolling budget noted as the "graph of agents" extension).

## The Watchdog (machine buyer)

Delta-triggered, not tick-triggered.

```
On schedule tick (already exists):
  1. Snapshot current catalog health (already computed by schema-analysis.ts)
  2. Load previous snapshot (already stored by schema-snapshots.ts)
  3. Compute delta: new failing tests, lineage changes, PII drift, freshness lag
  4. If delta_score > threshold:
       post_want({
         schemaFqn,
         focus: derived from delta,
         budgetLamports: user's per-brief cap,
         deadlineSec: 300,
         evidenceHints: top-N changed tables,
       })
  5. Else: no-op (silence is expected)
```

The Watchdog uses **existing** `schedules` + `schema-snapshots` + `schema-analysis` infrastructure. It's ~80 lines of glue, not a new service.

## Settlement verifier (consolidation)

Today, verify logic is duplicated across `api/checkout/palmusd/verify/route.ts` and `api/webhook/route.ts`.

After Phase 1:

```typescript
// src/lib/settlement/verifier.ts
export interface SettlementBackend {
  id: "escrow" | "pusd" | "stripe";
  verify(reference: string, expected: { amount: number; recipient?: string; hash?: string }): Promise<VerifyResult>;
  activate?(customerId: string, reference: string): Promise<void>;
}
```

Three impls, one interface. Existing checkout routes shrink to ~15 lines each. **Net deletion**, not addition.

## Phasing

| Phase | Status | Deliverable | Notes |
|---|---|---|---|
| **0 Spike** | ✅ Done | Escrow forked, `deliverable_hash` added, deployed to devnet | Program `DCq82m9wgkgQGVqokKmYsvjv9Ym8Lyz8usKvcSwUS3kY`; smoke test green |
| **1 Refactor** | ✅ Done | Persona sellers, market types, settlement verifier consolidation | Existing checkout routes now delegate to `settlement/backends/*`; duplication deleted |
| **2 Market wiring** | ✅ Done | `/api/market/*` routes, Watchdog delta trigger, buyer heuristic | Route added at `/api/market/watchdog` with `autoDrive:true` for one-shot demo |
| **3 Dashboard** | 🚧 In progress | `/market` live auction; episode player becomes settlement receipt | This is the pitch UI — the video films this |
| **4 Polish** | 🔜 | Reputation feed from mints; public seller registry; demo video; pitch deck | Wires existing on-chain infra into bid weighting |

## Consolidation deliverables (Prevent Bloat compliance)

By end of Phase 2, these are **deleted**, not deprecated:

- Inline verify logic in `api/checkout/palmusd/verify/route.ts` (moved to `settlement/backends/pusd.ts`)
- Inline verify logic in `api/webhook/route.ts` (moved to `settlement/backends/stripe.ts`)
- Any per-persona audio wiring outside `sellers.ts`

No parallel code paths. Stripe stays but through the shared verifier — one path, three backends.

## Judging criteria mapping

| Criterion | Weight | How we score |
|---|---|---|
| **Technology** | 40% | Working devnet demo end-to-end; forked escrow with `commit_delivery` proves contract-design attention; TypeScript-only client with clean module boundaries |
| **Impact** | 30% | An audio brief on your warehouse is a service someone would pay for today (DataBard already has paying users). Escrow with hash commitment holds up under no-show / bad-delivery dispute |
| **Creativity & UX** | 30% | Three named seller personas bidding out loud (LLM reasoning shown in the dashboard); delta-triggered agent buyer; live auction UI with Explorer links at every state; the "settlement receipt" that is also the episode itself |

## Submission checklist

- [ ] Working demo runs `npm run dev` and completes WANT → RELEASED end-to-end on devnet
- [ ] Public GitHub repo, no keys committed
- [ ] Live Explorer link at each demo state transition
- [ ] Pitch deck (5 slides): Customer / What it sells / Why they pay / The economy / **Proof (settlement + explorer + delivered audio)**
- [ ] Demo video (3 min): Problem → Solution → Demo → Team
- [ ] Lead with the settlement. Don't pitch the plumbing.

## Lessons from the spike (record for future contract work)

- **Anchor 0.32.1 discriminators are `sha256("account:<Name>")[:8]` / `sha256("global:<ix_name>")[:8]`.** Hand-writing an IDL is fine, but *always* verify against the generated `target/idl/*.json` before deploying. I invented a `commit_delivery` discriminator by mistake; catching it before deploy saved a broken client.
- **Solana platform-tools v1.48 ships Rust 1.84**, which chokes on modern crates that require `edition2024` (stabilized in 1.85). Pin `proc-macro-crate → 3.1.0`, `zeroize → 1.8.1`, `hashbrown → 0.15.5`, `indexmap → 2.7.0`, `unicode-segmentation → 1.12.0` in `Cargo.lock`.
- **Devnet public airdrop is unreliable.** Smoke test uses `~/.config/solana/id.json` (funded manually) as the buyer and funds a fresh seller keypair from it. No airdrop dependency.

## Open questions (for post-hackathon)

- Rolling agent budget across briefs (extension: "graph of agents" story)
- External seller onboarding — auth model for third-party persona registries
- Reputation weighting — how many settled deliveries before a persona's bids get preferred?
- Cross-catalog buyers — one Watchdog agent buying briefs across multiple warehouses?
