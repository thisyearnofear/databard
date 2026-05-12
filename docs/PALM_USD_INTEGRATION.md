# Palm USD × DataBard Integration

> **Submission for:** Palm USD x Superteam UAE — Solana Builders Hackathon  
> **Live demo:** [databard.thisyearnofear.com](https://databard.thisyearnofear.com)  
> **Prize track:** Frontier Hackathon

---

## Overview

DataBard integrates Palm USD (PUSD) as a native payment rail for Pro subscriptions. Users pay 29 PUSD/month directly from their Solana wallet — no intermediaries, no freeze risk, instant activation.

This is not a wrapper around a traditional payment processor. The entire flow happens on-chain via SPL token transfer, verified server-side, with Pro access activated the moment the transaction confirms.

## Why Palm USD Fits DataBard

| Palm USD Principle | DataBard Application |
|---|---|
| **Non-freezable** | Data teams need reliable access to their monitoring tools. A frozen payment shouldn't lock you out of health alerts. |
| **24/7 settlement** | DataBard generates episodes around the clock. Payment should work the same way. |
| **No intermediaries** | Direct wallet-to-treasury transfer. No Stripe fees, no bank delays, no chargebacks. |
| **Native on Solana** | DataBard already lives on Solana (minting, SNS identity, leaderboard). PUSD is a natural fit. |

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Client UI   │     │  Next.js API      │     │  Solana Network │
│              │     │                    │     │                 │
│ PalmUsdCheck │────▶│ POST /checkout/    │────▶│ Build unsigned  │
│ out component│     │      palmusd      │     │ SPL transfer TX │
│              │◀────│                    │◀────│                 │
│              │     └──────────────────┘     └─────────────────┘
│              │                                       │
│  Sign in     │───────────────────────────────────────┘
│  wallet      │         (user signs TX)
│              │
│              │     ┌──────────────────┐     ┌─────────────────┐
│              │────▶│ POST /checkout/    │────▶│ Verify TX on    │
│              │     │  palmusd/verify   │     │ Solana RPC      │
│              │◀────│                    │◀────│                 │
│  Pro active! │     │ Activate Pro      │     │ Confirmed ✓     │
└──────────────┘     └──────────────────┘     └─────────────────┘
```

## Technical Implementation

### Token Details

- **Token:** Palm USD (PUSD)
- **Standard:** SPL Token
- **Decimals:** 6
- **Mint address:** `CZzgUBvxaMLwMhVSLgqJn3npmxoTo6nzMNQPAnwtHF3s`
- **Chain:** Solana (mainnet-beta)
- **Price:** 29 PUSD = $29 USD (1:1 peg)

### API Flow

#### 1. Create Payment Transaction

```
POST /api/checkout/palmusd
Content-Type: application/json

{ "walletAddress": "7xKX...abc" }
```

**Response:**
```json
{
  "ok": true,
  "unsignedTxBase64": "AQAAAA...",
  "amount": 29,
  "token": "PUSD",
  "recipient": "treasury_wallet_address",
  "network": "mainnet-beta"
}
```

**Server-side logic:**
1. Resolve payer's Associated Token Account (ATA) for PUSD mint
2. Check balance ≥ 29 PUSD
3. Build `createTransferInstruction` (payer ATA → recipient ATA, 29_000_000 lamports)
4. Set fee payer, recent blockhash
5. Serialize unsigned and return

#### 2. Client Signs & Submits

```typescript
const tx = Transaction.from(Buffer.from(unsignedTxBase64, "base64"));
const signedTx = await wallet.signTransaction(tx);
const signature = await connection.sendRawTransaction(signedTx.serialize());
await connection.confirmTransaction(signature, "confirmed");
```

#### 3. Verify & Activate

```
POST /api/checkout/palmusd/verify
Content-Type: application/json

{ "walletAddress": "7xKX...abc", "txSignature": "5Uh7...xyz" }
```

**Server-side logic:**
1. Fetch transaction from Solana RPC
2. Verify transaction succeeded (no `meta.err`)
3. Verify recipient wallet is in the transaction's account keys
4. Activate Pro for the wallet address
5. Return explorer URL

### UI Component

The `PalmUsdCheckout` component (`src/components/PalmUsdCheckout.tsx`) handles the full payment lifecycle with clear state transitions:

| State | UI | User Action |
|---|---|---|
| `idle` | "Pay with Palm USD" button | Connect wallet |
| `ready` | Wallet connected, "Pay 29 PUSD" button | Click to pay |
| `signing` | Spinner + "Approve in wallet…" | Sign in wallet popup |
| `confirming` | Spinner + "Confirming on-chain…" | Wait |
| `success` | Green checkmark + explorer link | Done |
| `error` | Error message + "Try again" | Retry |

### Design Decisions

1. **Server builds the transaction** — the client never constructs token transfer instructions directly. This prevents amount manipulation and ensures the recipient is always the DataBard treasury.

2. **Balance check before signing** — the server verifies the user has enough PUSD before returning the unsigned transaction. This avoids failed transactions and wasted gas.

3. **On-chain verification** — we don't trust the client's claim that payment succeeded. The server independently fetches and verifies the transaction from Solana RPC.

4. **Wallet-based identity** — Pro access is keyed to the Solana wallet address. No email required, no account creation friction.

## Configuration

```env
# Required for Palm USD payments
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_PALM_USD_MINT=CZzgUBvxaMLwMhVSLgqJn3npmxoTo6nzMNQPAnwtHF3s
PALM_USD_RECIPIENT=<your_treasury_solana_wallet>
```

## Dependencies

```json
{
  "@solana/web3.js": "^1.98.4",
  "@solana/spl-token": "^0.4.14",
  "@solana/wallet-adapter-react": "^0.15.39",
  "@solana/wallet-adapter-wallets": "^0.19.38"
}
```

## Files

| File | Purpose |
|---|---|
| `src/app/api/checkout/palmusd/route.ts` | Builds unsigned PUSD transfer transaction |
| `src/app/api/checkout/palmusd/verify/route.ts` | Verifies on-chain payment, activates Pro |
| `src/components/PalmUsdCheckout.tsx` | Full-lifecycle payment UI component |
| `src/components/SolanaProvider.tsx` | Wallet adapter context (Phantom, Solflare) |
| `src/components/SolanaWalletConnect.tsx` | Wallet connect/disconnect UI with SNS resolution |

## Security Considerations

- **No private keys on server** — the server only builds unsigned transactions. Signing happens exclusively in the user's wallet.
- **Recipient validation** — the verify endpoint checks that the DataBard treasury wallet is in the transaction's account keys.
- **Amount validation** — the server sets the transfer amount (29 PUSD). The client cannot modify it.
- **Replay protection** — each transaction uses a recent blockhash with a limited validity window.
- **No token account creation risk** — we use Associated Token Accounts (deterministic derivation), not arbitrary accounts.

## User Experience

The payment flow is designed to feel native to Solana users:

1. **One-click wallet connect** — standard Solana wallet modal (Phantom, Solflare)
2. **Clear pricing** — "29 PUSD" shown before and during payment
3. **Trust signals** — "Non-freezable · 1:1 USD backed · Solana SPL" displayed below the button
4. **Progress feedback** — distinct states for signing vs. confirming
5. **Success confirmation** — checkmark animation + direct link to Solana Explorer
6. **Error recovery** — clear error messages with retry option; wallet rejections silently reset

## Palm USD Brand Integration

The checkout uses Palm USD's brand green (`#3f6b4a`) as a CSS custom property (`--palm`) alongside DataBard's purple accent. This creates visual distinction between the two payment methods (Stripe = purple, Palm USD = green) while maintaining design coherence.
