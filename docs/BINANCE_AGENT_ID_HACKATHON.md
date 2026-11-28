# Binance Agent ID Hackathon — Probe opportunity

> **Status:** validation in progress; local contract proof complete; not deployed or entered.
> **Assessed:** November 27, 2026.
> **Deadline:** December 9, 2026, 08:00 UTC.
> **Official announcement:** <https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf>

## Verdict

**Directionally strong, but not commit-ready.** This is a real Probe fit, not
generic hackathon opportunism: Agent ID proves a non-transferable agent
identity; Probe measures whether the service an agent is about to pay is worth
paying. That is exactly DataBard's "trust and receipt layer for the agent
economy" thesis.

The constraint is execution, not narrative. The current roadmap's next proof is
the edition loop, while this opportunity belongs to the later agent-economy
depth work. Enter only as a **48-hour validated exception**: prove the contract
interaction and external distribution path quickly, or use the idea as a
content-only Probe distribution experiment and skip the submission.

Strategic fit: **high**. Timing fit: **weak**. Prize money alone does not
justify the work; Binance ecosystem distribution and a credible receipt artifact
are the real upside.


## Validation snapshot — November 27, 13:30 UTC

Completed since the initial review:

- **Option B implemented.** `contracts/probe-receipts/src/ProbeReceiptRegistry.sol`
  now provides the Agent ID-gated `requestProbe` user-write path and a
  publisher-only `publishReceipt` oracle-write path.
- **Local contract proof passes.** 9/9 unit tests pass for Agent ID gating,
  subject-hash binding, publisher-only receipt writes, validation, replacement,
  and `isSafeToPay` behaviour.
- **Real BSC fork proof passes.** With `BSC_FORK_RPC_URL`, the fork test deploys
  against the official Agent ID registry and impersonates the public owner of
  the `reckon` Agent ID locally; the exact `requestProbe` transaction succeeds.
  This is a simulation, not a mainnet interaction.
- **First real Probe measurements exist.** Reckon MCP, MintBeacon MCP, and
  Pokter MCP were probed through the actual runner. Canonical evidence files are
  in `public/probe/receipts/`; all three returned HTTP 200. Reckon scored 72
  and MintBeacon/Pokter scored 77 in the refreshed validation run; all were
  healthy but explicitly labelled as tools/list interface-health evidence.
- **x402 is cut from v1 unless credentials appear.** The live Binance Web3
  `/build/api/v2/b402/supported` endpoint exists but returns `API Key is
  required`; no Binance Web3 API credentials are present locally. Do not make
  the hackathon artifact depend on B402.
- **First-market inventory exists.** See
  [`AGENT_ID_HACKATHON_INVENTORY.md`](AGENT_ID_HACKATHON_INVENTORY.md). The key
  finding is mixed: 20+ outreach candidates exist, but only a minority expose
  Probe-measurable machine endpoints. Pokter is a direct, strong benchmark for
  measured agent-service reliability.

Still missing for go/no-go: deployment key + BNB gas, BscScan verification key,
a deployed registry address, external Agent ID wallets willing to transact, and
actual outreach replies.

## Verified rules that shape the design

From the official announcement:

- Submission period: **2026-11-18 08:00 UTC → 2026-12-09 08:00 UTC**.
- New and existing projects are eligible. For existing projects, only data
  generated during the submission window counts.
- Participating projects must deploy contracts on **BNB Chain**, verify the
  source on BscScan, and make the code publicly open-source.
- The relevant track is **Agent Application Innovation**. It requires a live
  product and **at least 30 distinct Agent ID addresses interacting with the
  submitted contract(s) during the submission window**.
- Judging is weighted: Agent ID application depth **30%**, practicality and
  feasibility **25%**, product completion **25%**, innovation **20%**.
- Only contract addresses submitted by the participant count, and interacting
  addresses must hold an Agent ID.
- Safety rules matter: no web-based QR/pairing-code login, no hidden asset
  movement or bypassing user confirmation, no unlimited-approval tricks, no
  sensitive-credential collection, no return promises, and no Binance/BNB brand
  impersonation. Agent ID must not be used as a wallet lookup-by-name tool.
- Rewards require an active Binance account; winner contracts/projects may be
  featured in future Agent ID campaigns.

The Pioneer track is interaction-volume weighted and is already dominated by
mint/check-in/game loops. Do not chase it. The Innovation track is the only
relevant target.

## Why Probe fits

Agent ID proves that a wallet has a `.ai` name. It does **not** prove that an
agent service is useful, reliable, safe, or worth paying. Probe already attacks
that gap: it evaluates agent services, scores quality, and can turn the result
into portable evidence.

The strongest submission is not "DataBard on BNB Chain." It is a narrow
vertical:

**Probe Receipts — the quality oracle for the Agent ID economy.** Agent ID
proves *who* is transacting; Probe proves *what is worth paying*. Agent ID
holders request or pin a measured service receipt; other agents query that
evidence before spending money.

The first market is the hackathon itself: submitted mints, games, marketplaces,
launchpads, and agent services all need discovery and credibility. A public
Probe-powered index of those services is both the demo and the distribution
artifact.

## Strategic alignment

Aligned with the North Star:

- **Public accounting:** Probe receipts are machine-readable accounting for
  agent-service quality.
- **Two doors, one engine:** a public index for humans, a receipt/query interface
  for agents, both powered by the same Probe measurements.
- **Every claim checkable:** the artifact must link the score to the evidence
  payload, method, timestamp, and probe receipt.
- **Chain as rail, not identity:** BNB Chain is settlement/verification
  infrastructure for this lane. DataBard does not become a BNB product.

Misaligned if done lazily:

- A Binance-only fork of Probe would violate the one-engine rule.
- Agent-ID-gated arbitrary reviews would become a reputation wall, not measured
  accounting.
- A cosmetic `balanceOf` check would score poorly on Agent ID depth and would
  not create the required contract interactions.
- Vanity interactions during the hackathon are not evidence of sustained demand.

## Critical correction: interactions must be user transactions

`balanceOf(wallet) > 0` is the identity primitive, but reading it off-chain does
not count as hackathon interaction. If DataBard's backend publishes every
receipt, only DataBard's address interacts with the contract.

The design must make the Agent ID holder send a transaction to the submitted
contract. The contract should check the Agent ID registry on-chain:

```solidity
require(agentId.balanceOf(msg.sender) > 0, "Agent ID required");
```

The existing `contracts-src/ProbeVerdictRegistry.sol` is the right conceptual
starting point, but it is publisher-only. It cannot satisfy the distinct-user
interaction requirement unchanged.

## Trust model: measured receipts, not user reviews

DataBard's credibility depends on keeping measurement separate from opinion.
Do not let any Agent ID holder publish arbitrary scores as if they were Probe
findings.

Two acceptable designs:

### Option A — signed receipt relay (preferred if time allows)

1. User probes a service through DataBard.
2. DataBard returns a canonical verdict payload, verdict hash, evidence URI,
   and a signature from the DataBard publisher key.
3. The user's wallet submits that signed payload to the BNB receipt contract.
4. The contract checks Agent ID ownership and verifies the publisher signature.
5. The receipt is stored with `msg.sender` as the pinning/paying identity.

This preserves oracle integrity while making the user transaction meaningful.
It costs more implementation time: canonicalization, EIP-712 or signed payload
verification, and careful replay protection.

### Option B — request/publish registry (simpler fallback)

1. An Agent ID holder calls `requestProbe(subjectHash, subjectUri)` on the BNB
   contract. That user transaction is the hackathon interaction.
2. DataBard listens for requests or accepts the same subject through the UI/API.
3. Probe measures the service deterministically.
4. The DataBard publisher writes the measured verdict to the contract.
5. Reads are open to everyone.

This is easier to build and still separates user demand from oracle output. The
tradeoff is asynchronous publication and a more visible oracle dependency.

**Recommendation:** start with Option B for the validation path. Add Option A's
signed relay only if the first external interactions prove demand and there is
time before the deadline.

## Implementation runbook — prepared, not deployed

### Contract proof

The Foundry project lives in `contracts/probe-receipts/`. `forge-std` is not
committed; install the pinned test dependency if the directory is absent:

```bash
cd contracts/probe-receipts
git clone --depth 1 --branch v1.9.7 https://github.com/foundry-rs/forge-std.git lib/forge-std
```

On this machine `forge` in `~/.local/bin` is a different CLI, so use the
Foundry binary explicitly:

```bash
$HOME/.foundry/bin/forge test
BSC_FORK_RPC_URL=https://bsc-rpc.publicnode.com $HOME/.foundry/bin/forge test --match-contract Fork -vv
$HOME/.foundry/bin/forge script script/Deploy.s.sol
```

Current proof: 9/9 local tests pass; the fork test also passes against the real
Agent ID registry when `BSC_FORK_RPC_URL` is set. Deployment simulation uses
about 0.94M gas.

### Measurement and evidence

Generate canonical evidence for the first confirmed MCP services:

```bash
npx tsx scripts/probe-receipt-measure.mts public/probe/receipts https://databard.persidian.com/probe/receipts
```

The evidence hash is sha256 over the exact canonical JSON bytes. Do not pretty-
print or add whitespace to evidence files after measurement; that would change
the hash.

### Deployment — requires explicit owner action

Do not deploy from an ad-hoc key. The deployer becomes the immutable publisher.
There is no rotation or pause path: if that key is compromised or lost, the
correct mitigation is to abandon the registry and deploy a replacement. Before
deployment choose the publisher key deliberately and fund it with a small
amount of BNB. Required environment:

```bash
PROBE_RECEIPTS_DEPLOYER_PK=...   # key that will become immutable publisher
BSCSCAN_API_KEY=...              # for source verification
```

Then:

```bash
cd contracts/probe-receipts
$HOME/.foundry/bin/forge script script/Deploy.s.sol \
  --rpc-url https://bsc-rpc.publicnode.com \
  --broadcast \
  --private-key "$PROBE_RECEIPTS_DEPLOYER_PK"

$HOME/.foundry/bin/forge verify-contract <DEPLOYED_ADDRESS> \
  src/ProbeReceiptRegistry.sol:ProbeReceiptRegistry \
  --chain 56 --verifier etherscan --etherscan-api-key "$BSCSCAN_API_KEY" \
  --guess-constructor-args --watch
```

After deployment set:

```bash
PROBE_RECEIPTS_REGISTRY_ADDRESS=<DEPLOYED_ADDRESS>
PROBE_RECEIPTS_PUBLISHER_PK=<same publisher key>
```

### User request calldata

Prepare, but never broadcast, the exact Agent ID user interaction:

```bash
npx tsx scripts/probe-receipt-request.mts <DEPLOYED_ADDRESS> https://reckon.markets/api/mcp mcp
```

The output is a zero-value `requestProbe` transaction payload. The sender still
pays BNB gas and must hold an Agent ID. Do not ask users to sign anything else.

### Publisher receipt calldata / broadcast

Dry-run a publisher write:

```bash
npx tsx scripts/publish-probe-receipt.mts public/probe/receipts/reckon-mcp-ad747ad662.json
```

Broadcast only after the evidence file is actually deployed at its public URL
and the registry address/publisher key are set:

```bash
npx tsx scripts/publish-probe-receipt.mts public/probe/receipts/reckon-mcp-ad747ad662.json --broadcast
```

## Existing assets to reuse

Reuse, do not fork:

- `src/lib/probe-runner.ts` — endpoint probing, SSRF guard, x402 payment logic.
- `src/lib/probe-scorer.ts` — six-dimension scoring.
- `src/lib/marketplace-index.ts` — health-index patterns, honesty labels,
  persistence, uptime history.
- `src/components/probe/ResultCard.tsx` and `/probe` UI patterns.
- `contracts-src/ProbeVerdictRegistry.sol` — oracle registry design and
  `isSafeToPay` composability hook.
- `public/llms.txt` — agent-facing integration surface.

Current x402 infrastructure is **not** chain-generic. `src/lib/x402.ts` is
hardwired to the OKX facilitator and X Layer (`eip155:196`). Binance's current
B402 merchant API is also credential-gated: `POST
https://web3.binance.com/build/api/v2/b402/supported` exists but returns
`API Key is required` without Binance Web3 API credentials. Since no such
credentials are configured locally, **BNB x402 is cut from v1 by default**. If
credentials arrive before November 29, it can be re-spiked; otherwise do not
mention payment support in the submission as if it exists.

## Recommended product shape

### 1. Public index — human door

A live **Agent ID Hackathon Service Health Index**:

- hackathon services and endpoints, where publicly available
- Probe status, latency, schema/payment-gate signals, uptime where available
- honest labels: measured, payment-gated, unreachable, unverified
- per-service receipt pages and badges
- no fake precision for services Probe could not measure

This is the shareable public-accounting artifact.

### 2. Receipt/request contract — interaction layer

Minimal BNB contract:

- on-chain Agent ID gate for user writes
- requestProbe and/or pinReceipt flow as above
- publisher-only measured verdict writes
- append-only receipt/request events
- immutable publisher or clearly documented owner posture
- no token, staking, upgradeability, admin scoring, pause, freeze, tax, or asset
  custody

Verify source on BscScan and keep the Solidity simple enough to audit in one
sitting.

### 3. Agent-native interface — machine door

Update `public/llms.txt` with exact machine instructions:

- how to call Probe
- how to read a receipt
- exact contract addresses and ABI functions
- exact `baw contract-call preview` / `execute` flow if using Binance Agentic
  Wallet
- exact x402 payment flow only if BNB x402 is proven end-to-end

Agent-facing instructions are not marketing copy; they are part of the product.

## Scope discipline

### Must-have for submission

- Verified open-source BNB contract.
- Agent ID checked inside the contract write path.
- One focused public page/index.
- At least one real external service measured and displayed.
- A credible path to 30 distinct real Agent ID interactions.
- Exact agent integration docs.

### Should-have after eligibility is credible

- Signed receipts or a cleaner request→publish linkage.
- Per-service badges/receipt links.
- Multiple third-party hackathon services measured.

### Stretch only after 30+ interactions are visible

- BNB x402 lane.
- Payment-linked receipt publication.
- Cross-chain receipt unification.

### Explicitly out of scope

- Porting DataBard's warehouse/data-estate product to BNB Chain.
- A badge, daily check-in, referral, points, or speculative token mechanic.
- Arbitrary user-submitted quality scores presented as Probe measurements.
- A generalized multi-chain reputation migration.
- Owner-controlled scoring or hidden admin powers.
- Using Agent ID to look up or expose people's wallets by name.

## Distribution plan: the hackathon is the first market

Do not "build it and hope." The distribution artifact is the public index.

1. Inventory public hackathon projects, endpoints, repos, and contract addresses
   from public announcements, GitHub search, project pages, X posts, and any
   official leaderboard. Initial inventory:
   [`AGENT_ID_HACKATHON_INVENTORY.md`](AGENT_ID_HACKATHON_INVENTORY.md).
2. Probe the services that expose machine-readable endpoints; mark the rest
   honestly as unmeasured or not applicable. Confirmed Probe-measurable MCP
   endpoints in the first scan: Reckon, MintBeacon, and Pokter. BGOAT has a
   machine-readable manifest but is not an MCP service; most other candidates
   are contract-only.
3. Publish the index and per-service receipts. Do not fabricate scores for
   contract-only projects: separate "measured" from "machine-readable but not
   Probe-measured" and "unmeasured / contract-only".
4. Contact the strongest projects directly with their receipt link. First
   outreach cohort: Reckon, MintBeacon, SINCOR, Pokter, BGOAT, sqrJOBS, Agent
   Delegate, AgentTrust, AgentBoard (Fandybala), AgentBoard (IAN4JPG). The ask
   is not "use our dApp"; it is "your service has a measurable credibility
   receipt — request/pin it if you want it anchored."
5. Publish exact agent-native instructions so Binance Agentic Wallet users can
   interact without a bespoke tutorial.
6. Post progress publicly with `#BinanceWalletHackathon` and `#AgenticWallet`,
   but never buy, script, or fake interactions. The rules explicitly allow
   disqualification for manipulation.

Target 100+ interacting Agent IDs because 30 is only eligibility. The meaningful
target is external adoption: at least half of interactions should come from
people/projects outside our own wallets and immediate circle.

## Go / no-go gates

Use a hard 48-hour validation gate from November 27.

Proceed only if all of these are true by November 29:

1. **Contract path proven:** the exact user-write interaction works on testnet
   or mainnet and at least 3 external Agent ID wallets have completed it.
2. **Distribution path proven:** 10+ real hackathon participants or Agent ID
   holders are identified and at least a few have agreed to test/pin/request a
   receipt.
3. **Evidence model chosen:** request/publish or signed-relay architecture is
   fixed; no arbitrary user scoring.
4. **x402 decision made:** either one end-to-end BNB x402 payment succeeds, or
   x402 is explicitly cut from v1.
5. **Roadmap cost accepted:** the effort remains a timeboxed distribution
   experiment and does not silently replace Phase 11 user interviews/outreach.

If any gate fails, skip the submission. Optionally still publish the service
index as a Probe marketing artifact, because it tests demand without requiring
contract distribution.

## Execution path toward December 9

### November 27 — decision and validation design

- Freeze the product framing: Probe Receipts, not DataBard-on-BNB.
- Choose Option B vs Option A for the first contract.
- Inventory existing hackathon projects and distribution channels.
- Spike Binance x402 merchant requirements only enough to make the include/cut
  decision.

### November 28 — contract and local proof

- Implement the minimal receipt/request contract.
- Test Agent ID gating and publisher-only verdict writes.
- Connect one local Probe result to the publication flow.
- Draft exact agent instructions.

### November 29 — deploy and go/no-go

- Deploy to BNB Chain mainnet if the flow works.
- Verify source on BscScan.
- Get the first external Agent ID interactions.
- Make the formal enter/skip decision against the gates above.

### November 30 – December 2 — public artifact

- Build the hackathon service index and per-service receipt pages.
- Measure the first real third-party services.
- Start direct participant outreach with receipt links.
- Keep the UI narrow: probe/request/pin/inspect.

### December 3 – December 6 — distribution push

- Daily outreach to hackathon projects and Agent ID holders.
- Publish progress and useful findings, not engagement bait.
- Track distinct interacting Agent IDs, repeat use, external services measured,
  and receipt shares.
- Add signed receipts or BNB x402 only if eligibility is already credible.

### December 7 — submission freeze

- Confirm contract addresses, verification, source links, live product URL,
  screenshots, and Agent ID usage description.
- Draft submission copy around the judging weights.
- Stop feature work except correctness/compliance fixes.

### December 8 — submit with buffer

- Submit before the end of December 8 UTC where possible.
- Keep one day for corrections if the form or project materials expose a gap.

### December 9, 08:00 UTC — hard deadline

No launch-day heroics. If the artifact is not stable by December 8, submit the
smaller stable version or do not submit.

## Success metrics beyond eligibility

Do not optimize only for the 30-address minimum.

- **Eligibility:** 30+ distinct Agent ID addresses interacting with submitted
  contracts; target 100+.
- **Real usage:** 10+ external services probed or requested.
- **Distribution:** 5+ projects share/link their receipt or the index.
- **Agent usage:** receipt reads or probe calls from agents we do not control.
- **Payment validation:** at least one real x402-paid probe if x402 is included.
- **Retention:** repeat interactions or probe reads after the first interaction,
  not just one-off eligibility transactions.
- **Integrity:** zero unlabelled demos, zero fake interactions, zero arbitrary
  user scores presented as measurements.

## Open questions before committing

- Whether Binance Web3/B402 credentials can be obtained before November 29;
  without them x402 remains out of scope.
- Best wallet interaction path for Agent ID holders: injected Binance Wallet,
  Binance app dApp browser, or `baw contract-call` Developer Mode flow.
- Deployment wallet, BNB gas funding, BscScan verification account/process, and
  reward recipient account.
- Whether the request/publish contract model is sufficient for judges to score
  Agent ID depth highly, or whether signed user relaying is needed.
- How Probe Receipts should differentiate from Pokter's already-strong agent
  marketplace measurement: portable payment-gating receipts and composability,
  not another leaderboard.
- Whether v1 receipts should remain `tools/list` interface-health receipts or
  wait for safe read-only tool invocations. The current evidence is honest about
  the exact probe request, but it does not prove tool-output correctness.
- Whether contract-only projects can be included as honest unmeasured entries
  without diluting the meaning of a Probe receipt.

## Skeptic review corrections — November 27, 2026 (evening)

The pitch was fielded with critical reviewers before deployment. Their pushback
and what changed:

### The headline stat was wrong — corrected and hand-verified

An earlier draft claimed "21 of 36 paid finance services degraded/broken/
unreachable — agents lose the bet 58% of the time". Both the number and the
inference were wrong. Corrected: of 36 paid finance services, **11 failed the
interface probe**; all 11 were hand-re-checked from a second independent
network (the VPS probes from its own network; the re-check ran from a separate
residential network):

- **10 hard failures replicated from both networks** — dead DNS/instant connect
  failure (botmate ×2), server errors (530 entropicapi, 525 rootedge,
  503 vivra, 502 unlockguard), 12s timeouts from both locations (haitun ×2 —
  the $50 and $199 "trading agent" endpoints — and sangjiege ×2)
- **1 misframed**: 美股AI半导体信号 is reachable (HTTP 200, ~270ms) — its
  "degraded" label is a payment-gate-integrity finding (substantive payload,
  no enforced 402), which is a marketplace-integrity issue, not buyer harm

The honest claim: **~30% of paid finance services were undeliverable at the
interface level at measurement time, replicated from two independent networks.**
Never claim output incorrectness from interface failure; never infer "agents
lose the bet" — a service can pass the probe and return garbage, and a
correctly enforced x402 gate rejecting an unpaid probe is evidence the gate
works, not a failure.

### Deep-check: first paid correctness verification (the missing layer)

`scripts/probe-deep-check.mts` — pays real money and verifies output
correctness against independent ground truth, with positive AND negative
controls. First run (tx cost $0.005):

- **Subject**: Barker Pool Detail (`mcp.barker.money`), their own documented
  example pool `spark_susdc_arbitrum`
- **Positive control**: paid 402 → 200 in 2519ms, settlement tx
  `0x53757a2104e213f33ce4f07c57a8e8b1b8d2ee58f65260a8b6674b83bc2ef159`.
  Claimed APY **3.80%** vs DefiLlama Spark Savings Rate consensus **3.8%** —
  verdict **match** (0.0pp diff). Claimed TVL $317.5M not cross-checkable
  (DefiLlama tracks no sUSDC-Arbitrum pool under that symbol) — excluded from
  verdict, not counted either way
- **Negative control**: nonexistent pool_uid → 404 *before payment* — no
  charge, no fabricated data. Honest
- Artifact: `public/probe/receipts/deep-check-barker-pool-detail-ccce79806f.json`
  (live at `/probe/receipts/…`, in the manifest)

Notable: Barker rejects invalid input *before* issuing the x402 challenge —
"no x402 challenge was issued and nothing was charged". That is what a
well-built paid service looks like, and the deep-check can now say so with
receipts.

### Other corrections adopted

- **Why on-chain, honestly**: timestamping and tamper-evidence for parties who
  do not trust our server — the chain is the notary, not the oracle. An agent
  can just call the API; most will. No grander claim.
- **Demand signal honesty**: hackathon-window `requestProbe` transactions are
  incentivized by the 30-address mechanic — they are not validation. Validation
  is organic requests after the window closes.
- **The wedge is high-stakes calls**: for a $0.01 call, burning the money is
  cheaper than checking. The product is for agents about to spend dollars.
- **Sharpened ask**: one question only — "before your agents pay a service,
  would they read a measured receipt?"
- **Methodology page hardened** (`/probe/marketplace` bottom): status-label
  definitions, known false-positive sources, the two-network replication rule,
  and a copy-pasteable re-check command so skeptics can verify in 30 seconds.

## Contract hardening from external review — November 28, 2026

A detailed external security review (plus DataBard's own second read) found the
contract sound for purpose but surfaced five improvements, all implemented
**before deployment** in the v2 revision (13/13 forge tests pass, including a
pinned-block live BSC fork test):

1. **Subject-bound evidence commitments.** The contract now computes
   `evidenceHash = keccak256(abi.encode(subjectHash, contentHash))` itself,
   where `contentHash = sha256(canonical evidence JSON)`. Evidence can never be
   cross-paired with the wrong subject, even by publisher error. Off-chain
   verification: fetch evidenceUri → canonicalize → sha256 → compare
   contentHash → recompute evidenceHash → compare. The evidence document also
   embeds the subject URI, so the binding is double-anchored.
2. **Freshness monotonicity.** `publishReceipt` reverts with `StaleReceipt` if
   the new `checkedAt` is older than the stored one — a receipt update can
   never move the measurement backwards in time. Corrections re-measure.
   (Same-timestamp republication of the same measurement remains allowed.)
3. **Version counter.** Per-subject monotonic `version` in the receipt and in
   `ReceiptPublished`, so indexers can detect replacements and ordering despite
   overwrite storage semantics. The event log remains the permanent audit trail.
4. **NatSpec-documented hash schemes and status codes** (1 healthy, 2 degraded,
   3 broken, 4 unreachable; statuses describe the measured interface only).
5. **Fork test pinned to block 136200000** — requires an archive-capable
   `BSC_FORK_RPC_URL` (verified working: blastapi/meowrpc free endpoints;
   publicnode and bsc-dataseed prune historical state).

Review findings deliberately NOT adopted, with reasons:

- **Multisig publisher (deferred, not rejected).** A 2-of-3 Safe as publisher
  adds no rug surface and improves custody — but it is incompatible with
  automated continuous publishing, which is how receipts are produced. Since
  the registry is immutable, custody upgrades require redeployment to a new
  address anyway; the honest phasing is hot key while publishing is automated,
  documented and monitored, with the blast radius limited by the system's core
  property: **the publisher can forge a score but cannot forge the evidence** —
  every receipt links to publicly re-measurable evidence, so a forged receipt
  is provably false. The design fails visible, not silent.
- **Severity of the pre-fix evidence binding.** The reviewer rated the missing
  on-chain binding Medium; the evidence document always embedded its subject
  URI inside the hashed bytes, so cross-subject pairing was already detectable
  off-chain and only the (already-trusted) publisher could exploit it. The fix
  was implemented anyway because pre-deployment changes are cheap and the
  commitment-level binding is cleaner cryptography.

Pipeline updates: `createProbeReceiptArtifact` now emits `contentHash` plus the
bound `evidenceHash`; the measure script derives hash-bearing filenames from
contentHash (unchanged semantics — existing artifact filenames remain correct);
the manifest records both hashes; the publish pipeline re-verified end-to-end
(dry-run simulation passes). `scripts/probe-deep-check.mts` artifacts are a
different kind and are not subject to the registry binding.

Deployment status: still not deployed. Blockers unchanged — publisher key
funding (~0.02 BNB) and `BSCSCAN_API_KEY` for verification. Window extended:
the real distribution sprint is Dec 1–7; outreach has been going out slowly
and ramps up now that the reviewed artifacts exist.
