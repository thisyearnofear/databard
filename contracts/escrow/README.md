# DataBard Escrow — forked from solana_coralOS

**Source:** `github.com/trilltino/solana_coralOS` @ `examples/txodds/escrow` (Anchor 0.32.1)

**DataBard delta:** adds a **deliverable hash commitment** to the escrow state machine so
settlement doesn't just prove *payment*, it proves *what was delivered*.

## What changed vs. the upstream escrow

Upstream state machine:

```
initialize (buyer deposits) → release (buyer confirms delivery)
                            → refund  (buyer reclaims after deadline)
```

DataBard state machine:

```
initialize (buyer deposits) → commit_delivery (seller commits manifest hash)
                            → release (buyer confirms delivery)
                            → refund  (buyer reclaims after deadline)
```

Concretely:

1. **`Escrow` account** gains one field: `deliverable_hash: Option<[u8; 32]>`
2. **New instruction** `commit_delivery(hash: [u8; 32])` — signed by the **seller**
3. **`release()`** requires `deliverable_hash.is_some()` (the buyer can't accidentally release before the seller has committed a delivery)

That's it. Six new lines of state + one instruction. Everything else — PDA seeds, `close = buyer`,
`has_one` guards, refund-after-deadline semantics — is preserved verbatim.

## Why this matters for the demo

The pitch is "the customer is software; the winner is paid trustlessly through a Solana escrow."
DataBard extends that pitch: **the settlement transaction on-chain contains a hash of the audio
episode the buyer received.** A judge (or a downstream agent) can verify:

- The buyer's client downloaded audio whose SHA-256 matches `deliverable_hash`
- Therefore the seller was paid *for that specific episode*, not just for showing up

The manifest hash becomes the winning slide.

## Building & deploying (devnet)

**Live devnet program:** `DCq82m9wgkgQGVqokKmYsvjv9Ym8Lyz8usKvcSwUS3kY`
([Explorer](https://explorer.solana.com/address/DCq82m9wgkgQGVqokKmYsvjv9Ym8Lyz8usKvcSwUS3kY?cluster=devnet))

Requires: rustup (with `stable` default), Solana CLI, Anchor 0.32.1, `~/.config/solana/id.json`
funded with devnet SOL (~0.1 SOL is enough for the smoke test; more for a fresh deploy).

```bash
cd contracts/escrow
anchor build             # generates target/idl/escrow.json + target/types/escrow.ts
anchor keys sync         # points programs.devnet.escrow at your keypair
anchor deploy --provider.cluster devnet

# Run the end-to-end smoke test against the live devnet deploy:
npm install
npm run smoke
```

The smoke test uses `~/.config/solana/id.json` as the buyer (avoids the flaky public airdrop),
funds a fresh seller keypair for its tx fee, then walks the full lifecycle: DEPOSIT →
COMMIT_DELIVERY (with a SHA-256 manifest hash) → RELEASE. Explorer links are printed at each step.

### Toolchain quirks

Solana platform-tools v1.48 ships Rust 1.84.1, which does not support `edition2024` (stabilized
in Rust 1.85). Several modern transitive deps need it. The `Cargo.lock` in this repo pins:

- `proc-macro-crate` → 3.1.0
- `zeroize` → 1.8.1
- `hashbrown` → 0.15.5
- `indexmap` → 2.7.0
- `unicode-segmentation` → 1.12.0

If you regenerate `Cargo.lock`, re-apply these pins with `cargo update -p <name> --precise <ver>`.

### Point the app at your deploy

Set `NEXT_PUBLIC_ESCROW_PROGRAM_ID` in `.env` to your deployed program id. The IDL at
`src/lib/settlement/backends/escrow-idl.ts` is hand-written but discriminator-verified against
`target/idl/escrow.json` — re-run the check if you edit the Rust program.

## Files

```
contracts/escrow/
  Anchor.toml
  Cargo.toml                     # workspace
  programs/escrow/
    Cargo.toml
    src/lib.rs                   # the program (with our delta)
  client/
    escrow.ts                    # thin TS wrapper — used by settlement/backends/escrow.ts
```

The full runtime wrapper (deposit + commit_delivery + release + refund) lives at
`src/lib/settlement/backends/escrow.ts` in the main app and imports from `contracts/escrow/client/`.
