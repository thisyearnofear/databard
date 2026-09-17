# Portable Solana attestation HTTP API

Status: implemented and tested offline; not yet deployed. Live devnet RPC
preparation passed on September 17, 2026; the faucet returned an internal error,
so no Memo was broadcast and live inclusion remains unverified. Existing episode memo routes and X Layer/paid tools are unchanged.

## Trust and custody

The caller supplies the expected wallet (`issuer`) independently of the receipt,
signs locally and pays the Solana fee. The server never loads a private key.
This proves a wallet committed a digest, **not DataBard authorship or analytical
correctness**. A server-issued signature would require a trusted generation path,
not an open signing service for caller-supplied receipts.

Only the domain-separated payload hash goes into the Memo. Prepare and anchor
require `consent:true`; hashes are public and are not encryption. Receipt JSON
is sent to DataBard for validation but is not written into a local receipt ledger.

## Requests

All routes are POST with `Content-Type: application/json`. Body limit: 256 KiB,
measured while reading (not just Content-Length). Unknown fields are rejected.
Existing per-IP validation limiter: 60/hour, shared with routes using that helper;
this is per-process, not a distributed quota. Reverse proxies must sanitize IP
headers. Responses use `Cache-Control: no-store`.

Common fields:
- `receipt`: the complete `evidenceReceipt` returned by health-check.
- `issuer`: expected wallet public key (base58), supplied independently.
- `chain`: `solana:<full genesis hash>`; required, never inferred from the receipt.
- `finality`: `confirmed` (default) or `finalized`, on prepare/verify only.

### POST /api/attestation/solana/prepare

Common fields plus `consent:true`. Returns `prepared` with the unsigned legacy
transaction, chain, issuer, hash, blockhash and lastValidBlockHeight. No broadcast.
The requested network must match the configured RPC or the route returns 409.
Review the transaction in the wallet before signing. Only one Memo instruction
and the caller as fee payer are expected; no transfer or custom contract.

### POST /api/attestation/solana/anchor

Send `receipt`, `issuer`, `chain`, `consent:true`, and
`signedTransactionBase64` (the prepared transaction signed locally).
Only a validly signed, canonical, single hash-only Memo transaction is accepted.
Extra instructions, other fee payers, additional accounts and mismatching hashes
are rejected. The caller pays the network fee; this route does not sponsor it.

Returns **202**, `submission: submitted|unknown`, `reference` and
`inclusion:not-checked`. Neither 202 nor `submitted` means confirmed inclusion.
The signature is derived locally before send. A transport or preflight error
returns `unknown` with that reference: it may or may not have reached the chain.
No RPC error details or credentials are returned.

Verify first; rebroadcast **identical signed bytes** while the blockhash remains
valid. Retries reuse the same transaction signature rather than creating a new
fee-bearing transaction. There is no durable job queue or automatic re-signing.
If not found, check expiry against lastValidBlockHeight with the same network
RPC before requesting a fresh transaction and asking the wallet to sign again.

### POST /api/attestation/solana/verify

Send common fields and `transactionId`. Optionally send `result` (the original
health-check response with `evidenceReceipt` removed). Returns separate checks:
- `verification.integrity`: valid/invalid receipt hash.
- `verification.issuerAuthenticated`: expected wallet signed the matching Memo.
- `verification.inclusion`: not-checked/not-found/confirmed/finalized/failed/mismatch/rpc-error.
- `resultIntegrity`: valid/invalid/not-checked; independent of inclusion.

HTTP 200 means verification ran, **not that the evidence passed**. RPC outage
is `rpc-error`; a missing transaction is `not-found`, not automatically pending.
An optional explorer URL is null for unrecognized genesis hashes. Verification
needs no local ledger, account, signing key or original DataBard session.

## Reproducible verification request

Save the health response as `health.json` and the anchor response as `anchor.json`
in your private working directory. With Node available:

```bash
node -e 'const fs=require("fs"); const {evidenceReceipt,...result}=JSON.parse(fs.readFileSync("health.json")); const {reference}=JSON.parse(fs.readFileSync("anchor.json")); fs.writeFileSync("verify.json",JSON.stringify({receipt:evidenceReceipt,...reference,result,finality:"finalized"}));'
curl --fail-with-body -sS http://localhost:3000/api/attestation/solana/verify \
  -H 'Content-Type: application/json' --data-binary @verify.json
```

For independent verification, use `verifyEvidenceReceipt(receipt, {result})`
offline and `verifySolanaReceipt(receipt, reference, ownRpc, "finalized")` with
your own trusted RPC. RPC-backed verification is not a light-client proof.
Pin the expected signer yourself rather than trusting an unverified response.

## Deployment and acceptance

Runtime server env: `SOLANA_ATTESTATION_RPC_URL`, default public devnet. There is
no caller-supplied RPC URL and no dependency on NEXT_PUBLIC configuration.
Use a production RPC with appropriate limits; individual RPC fetches time out
after 10 seconds and SDK retries on HTTP 429 are disabled. Do not log request
bodies or private RPC URLs. See [Operations](OPERATIONS.md).

Tests: `npx tsx tests/attestation-http.unit.ts` (also in `npm run test:unit`).
They exercise route parsing, consent, size/type limits, signatures, mocked-RPC
prepare/sign/send/verify, same-byte retries and unknown-send outcomes. They do
not prove a live transaction has landed. Wallet UI and real devnet validation
remain the next acceptance gates.
