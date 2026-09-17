# Portable Evidence & World’s Fair

## Decision (September 17, 2026)

**Chain-agnostic evidence, Solana-native execution.** DataBard remains an AI analyst. Data sources, payment rails, and attestation networks are separate choices; no wallet is required for analysis or offline integrity checks.

## Opportunity and eligibility gate

The [official World’s Fair page](https://colosseum.com/worldsfair), checked September 17, lists an October 12, 2026 submission deadline, welcomes builders across crypto ecosystems, and advertises a $100,000 Solana track pool. Existing-project eligibility was confirmed by the project owner on September 17, 2026. Detailed judging criteria and track rules still need review. Maintain a dated baseline and log of new work; this confirmation is not a determination about every competition rule.

## Architecture

1. **Evidence receipt:** versioned JSON with analysis identity, requested source/schema, actual evidence identity, observation time, source freshness where available, metadata digest, and result digest. No connector credentials or raw source rows. Fetching time is not source freshness.
2. **Attestation adapters:** optional and independently selected. Wrap Solana Memo and existing X Layer anchoring without changing historical hash formats. Record network, issuer, transaction reference, and pending/confirmed/finalized status outside the immutable receipt.
3. **Payment adapters:** independent of attestation. Expose capabilities rather than equating immediate payment with escrow. Future monetary types use exact base-unit strings plus asset identifier and decimals; identities include their network. Preserve existing API and stored-deal compatibility.

Do not add a universal chain SDK, bridge, token, or custom contract merely for the competition.

## Delivery sequence

### 1. Portable foundation — first implementation slice

- Deterministic, versioned receipt and Node-based offline integrity verifier.
- Additive free health-check response field; preserve existing serviceVersion and fields.
- Commit to actual metadata and JSON-delivered response; distinguish requested schema from actual fixture and label demos.
- Separate observation time from adapter-reported freshness. Unknown freshness stays unknown.
- Measured costs already in the response are covered by its digest; absence means unknown, not zero. Exact settlement amounts remain a separate payment concern.
- No signatures, on-chain writes, or automatic public sharing in this slice.

### 2. Adapter separation and Solana verification

**Implemented locally:** chain-neutral attestation types and a Solana adapter that prepares an unsigned, hash-only Memo transaction and verifies a supplied receipt/reference through RPC. Tests cover wallet signing, the prepare/sign/verify round trip, wrong receipt/wallet/network, legacy memos, failed transactions, missing data, and RPC failure. HTTP routes now wrap the adapter at `/api/attestation/solana/{prepare,anchor,verify}` with offline route tests; see [API usage](ATTESTATION_API.md). UI integration and live-network verification remain pending. Legacy routes and X Layer behavior are unchanged. The HTTP flow is **caller-wallet-signed**, not server-issued: no private key is loaded by these routes. Publicly signing arbitrary unsigned receipts as DataBard would falsely authenticate caller-created content.

The adapter uses `solana:<full genesis hash>` as its network identifier (not a claim of CAIP-2 compliance). References require an independently supplied expected wallet. `issuerAuthenticated` means that wallet signed the matching Memo instruction in the RPC-reported successful transaction—not that the wallet belongs to DataBard. Verification trusts the configured RPC and supports confirmed/finalized commitment. Missing transactions are `not-found`, not automatically pending. Preparation never broadcasts; wallet signing and submission remain caller responsibilities.

- Remove Solana-specific types and explorer assumptions from shared boundaries; keep SDKs in adapters.
- Preserve old verification paths and version every new format.
- Add issuer signing, confirmed inclusion checks, retries/idempotency, and independent verification from a supplied receipt plus RPC transaction.
- Distinguish integrity, issuer authentication, and chain inclusion in API/UI; avoid an ambiguous “verified” badge.
- Obtain consent before anchoring private evidence. Hashes are not encryption and may expose low-entropy information; separately review public metadata.

### 3. One real operator workflow

Investigate a metric change, explain the evidence, recommend an action, and export a receipt verifiable against Solana. Identify an operator and validate source semantics before adding connectors. Measure time saved, usefulness, and repeat usage. Never present fallback fixtures as live evidence.

### 4. Payment hardening — not the submission critical path

Strengthen PUSD validation (mint, amount, recipient, payer and replay binding); review escrow semantics, deployment identity, custody, and tests before handling meaningful funds. A delivery hash does not prove correct work or independent sellers.

## Receipt v1 and offline verification

Format: `databard.evidence-receipt`, version `1`, canonicalization `databard-json-v1`, SHA-256 lowercase hexadecimal digests. Canonical JSON recursively sorts object keys by JavaScript UTF-16 ordering, preserves array order, and uses JSON string/finite-number encoding. It rejects undefined values, non-finite numbers, sparse arrays, non-plain objects and cycles. This is a DataBard format, **not RFC 8785 compliance**.

`payloadHash` covers the canonical payload, which contains `evidence.snapshotHash` (JSON-normalized SchemaMeta) and `resultHash` (the JSON response excluding evidenceReceipt). Metadata is not embedded; supply the original normalized snapshot to check it. The response supplies the result preimage. Export the receipt from the JSON response; a download UI is later work.

Offline consumers import `verifyEvidenceReceipt` from `src/lib/evidence-receipt.ts` in Node. A valid hash proves only internal consistency unless compared with an independently trusted digest/signature/anchor. Anyone can create a self-consistent unsigned receipt. `issuer` is currently a service label, **not authenticated identity**.

Freshness entries are adapter-reported, not cryptographic timestamps. `observedAt` records snapshot receipt, including cached/demo data. Reproducing analysis also requires versioned analysis logic and clock inputs; hash verification alone does not reproduce analysis.

## Acceptance gates

- Stable hashes across object-key ordering and JSON round trips; changed content fails verification.
- Unsupported formats, malformed payloads and supplied preimage mismatches fail closed.
- Route test: labelled demo, requested/actual schema distinction, credential exclusion, response digest matching, discovery metadata.
- Existing unit suite and TypeScript checks pass; production build assessed separately.
- No deployment, live settlement, eligibility, or customer validation claimed without evidence.
