# Agent ID Hackathon inventory — first market scan

> **Snapshot:** 2026-11-27 12:15 UTC.
> **Purpose:** validation input for the Binance Agent ID Hackathon go/no-go
> decision. This is not a ranked list of project quality.

## Key finding

The public hackathon field is dominated by mint, check-in, badge, tipping,
bounty, and contract-interaction projects. Only a small minority expose a
machine-readable agent service endpoint that Probe can measure directly.

That is good and bad news:

- **Good:** the field has a credibility problem, and many projects explicitly
  need Agent ID interactions.
- **Bad:** "probe every hackathon service" is not currently true; most projects
  are contract dApps, not A2MCP/x402 services.
- **Strategic implication:** the index must label contract-only projects as
  unmeasured rather than pretend Probe measured them. Initial measured receipts
  should focus on the few live MCP/A2A/x402 services, while outreach can still
  target contract-only projects that want a credibility receipt.

## Probe-measurable or machine-readable services confirmed

| Project | Evidence | Probe-relevant surface | Validation result |
| --- | --- | --- | --- |
| Reckon | [repo](https://github.com/eugenennamdi/Reckon), [app](https://reckon.markets), MCP `https://reckon.markets/api/mcp` | Streamable HTTP MCP, B402/x402 signal marketplace, live BNB contracts | `initialize` and `tools/list` returned HTTP 200 JSON-RPC on 2026-11-27; strong first receipt candidate |
| MintBeacon | [repo](https://github.com/tosinchukwu/MintBeacon), [site](https://mintbeacon.vercel.app), MCP `https://mintbeacon-mcp.wisp.uno/mcp` | Streamable HTTP MCP mint verifier, live BNB contract | health endpoint HTTP 200; `initialize` and `tools/list` returned HTTP 200 JSON-RPC on 2026-11-27; strong first receipt candidate |
| Pokter | [repo](https://github.com/successaje/pokter), [app](https://pokter.xyz), MCP `https://pokter.xyz/api/mcp` | BNB agent marketplace, endpoint probing, escrow delivery evidence, MCP | `initialize` and `tools/list` returned HTTP 200 JSON-RPC on 2026-11-27; strategically important competitor/benchmark |
| SINCOR | [site](https://getsincor.com), [repo](https://github.com/OrderofChaos33/SINCOR2) | A2A/x402 platform; agent-card discovery; BNB expansion in build | `/.well-known/agent-card.json` returned HTTP 200 JSON on 2026-11-27; not yet confirmed as a BNB Agent ID deployment |
| BGOAT | [repo](https://github.com/kaidilake01/bgoat-agent-id), [agent manifest](https://bgoat.xyz/launch/agent.json) | machine-readable contract manifest and agent instructions | `agent.json` and `agent.txt` returned HTTP 200 on 2026-11-27; not an MCP endpoint, but machine-readable |
| Agent Chain | [site](https://agent-chain.agency/) | claims x402, ERC-8004, and MCP infrastructure | TLS/connectivity failed from the validation machine on 2026-11-27; mark unreachable until independently confirmed |

## High-priority outreach candidates

These are the best initial distribution targets because they are live, have a
clear Agent ID integration, or operate adjacent trust/market infrastructure.

| Priority | Project | Category | Why contact them | Probe measurability |
| --- | --- | --- | --- | --- |
| A | [Reckon](https://github.com/eugenennamdi/Reckon) | forecasting/signal marketplace | sophisticated Agent ID usage, live MCP/x402, likely to understand receipts | Direct MCP measurement confirmed |
| A | [MintBeacon](https://github.com/tosinchukwu/MintBeacon) | mint verifier/trust tooling | adjacent evidence product with live MCP and contract | Direct MCP measurement confirmed |
| A | [SINCOR](https://getsincor.com) | agent control plane/A2A/x402 | larger ecosystem player expanding to BNB; strong distribution leverage | Agent-card JSON confirmed; BNB-specific service unproven |
| A | [Pokter](https://github.com/successaje/pokter) | agent marketplace/reliability measurement | direct benchmark/competitor; validates the market and raises the quality bar | Direct MCP measurement confirmed |
| A- | [AgentForge](https://github.com/fouZee/agentforge) | git forge + bounties | ambitious agent-native infrastructure with MCP/API design | Not yet deployed/configured per repo; not measurable as a live service |
| A- | [BGOAT](https://github.com/kaidilake01/bgoat-agent-id) | launchpad/swap/games | already publishes agent instructions and manifest; high ecosystem visibility | Machine-readable manifest, not A2MCP |
| A- | [sqrJOBS](https://github.com/sqrDAO/sqrJOBS) | escrowed agent work board | real work/payment primitive, live contract, CLI for `baw` | Contract/site measurable; no MCP confirmed |
| A- | [Agent Delegate](https://github.com/DataNinjaqe/agent-delegate) | scoped delegation | real Agent-ID-native permission primitive; strong complement | Contract-only |
| B+ | [AgentTrust](https://github.com/qwe12yuh/agenttrust) | trust/passport/reputation | adjacent reputation product with live contracts and agent calldata flow | Contract/site measurable; no MCP confirmed |
| B+ | [Aegis](https://github.com/Rainyy99/aegis) | verification/security evidence | adjacent evidence/verification product; useful benchmark for honest labels | CLI-oriented; no live MCP confirmed |
| B+ | [AgentBoard / Fandybala](https://github.com/Fandybala/agentboard) | intent board | live contract, explicit interaction metric, likely motivated by distribution | Contract-only |
| B+ | [AgentBoard / IAN4JPG](https://github.com/IAN4JPG/agentboard) | micro-bounty escrow | live verified contract, bounty/work use case | Contract/site measurable; no MCP confirmed |
| B+ | [Agent ID Invoices](https://github.com/buahrasa01-hub/agent-id-invoices) | invoicing/payments | payment primitive aligned with receipts; contract currently testnet/pending mainnet | Contract-only |
| B | [MintGuard](https://github.com/abihidayat/mintguard) | mint safety | adjacent measured-check product; live and thoughtful about safety labels | Site/CLI-oriented; no MCP confirmed |
| B | [Mint Guardian](https://github.com/ls4825783/mint-guardian) | mint safety reports | adjacent trust registry; useful contrast because user reports are not measured Probe receipts | Contract/site measurable; no MCP confirmed |
| B | [AgentVouch](https://github.com/basecil/agent-vouch) | reputation/vouching | important contrast: social vouching vs measured receipts | Contract-only |
| B | [AgentRadar](https://github.com/Rezzrizz25/agent-radar) | free-mint radar | active mint-discovery audience; likely interaction motivation | Contract/site measurable; no MCP confirmed |
| B | [AgentTask](https://github.com/azizfai/agent-task) | escrow microtasks | work/payment use case; details still sparse from README scan | Contract-only/unclear |
| B- | [QuestID](https://github.com/nonicon/questid) | quest board | distribution audience, but weaker product alignment | Contract/site measurable; no MCP confirmed |
| B- | [DropLedger](https://github.com/Dutaweb3/dropledger) | airdrop journal | active Agent ID user audience | Contract-only |
| C | [BRAIN](https://github.com/Kabantuhi/brain) | token/NFT ecosystem | large mint/community surface but weaker Probe alignment | Contract/site measurable; no MCP confirmed |
| C | [GLORIFIER](https://github.com/GLORIFIER7/GLORIFIER) | broad agent platform | potentially relevant infrastructure, but hackathon fit and live service boundary unclear | Unclear |
| C | mint/check-in/badge/tip clones | distribution-only | possible source of raw interactions, but low strategic value and high noise | Mostly contract-only |

## Direct strategic observations

1. **Pokter is the strongest validation and the strongest threat.** It already
   measures whether BNB agents answer, grades delivery evidence, exposes MCP,
   and publishes provenance-sensitive reliability records. Probe Receipts cannot
   claim the category uncontested. DataBard's differentiator must be portable,
   composable, service-quality receipts tied to payment decisions — not a generic
   marketplace leaderboard.
2. **MintBeacon, MintGuard, Mint Guardian, and Aegis validate demand for
   evidence.** They also show the trust space is crowded. The honest positioning
   is "measured service quality before payment," not broad contract safety or
   social reputation.
3. **Most outreach targets are not measurable Probe subjects.** The index should
   have separate sections: measured service endpoints, machine-readable but not
   Probe-measured projects, and contract-only/unmeasured projects.
4. **Distribution can still work.** Even contract-only projects need distinct
   Agent ID interactions. A request/pin action gives them a reason to participate
   if the receipt page makes them look credible without fabricated measurement.
5. **Do not fake coverage.** Publishing scores for projects Probe cannot measure
   would destroy the only differentiation that matters.


## First-contact draft — do not send automatically

Use this only after the evidence files and contract are live. Adapt the measurement
facts; do not imply end-to-end tool correctness from a `tools/list` probe.

> Subject: Probe receipt for <project> — measured Agent ID service evidence
>
> Hi — I’m validating Probe Receipts for the Agent ID ecosystem. We measured
> <project>'s public MCP interface on Nov 27 as a single-shot interface-health
> check: HTTP 200, <latency>ms, <tool-count> tools advertised. The exact evidence
> and methodology are here: <evidence-url>.
>
> This is not a review or an endorsement beyond the measured evidence. We’re
> preparing an Agent ID-gated receipt registry where holders can request Probe
> measurement and DataBard can anchor measured receipts. Would you like the
> receipt for your service anchored/linked once the contract is live, or would
> you prefer to be left out of the public index?
>
> Happy to share the raw request/response evidence and correct anything that is
> mischaracterised.

Do not ask targets to interact before the contract is verified. Never offer
compensation for interactions.

## Personalized outreach pack — November 27, 2026

Evidence URLs are LIVE (verified 200). Rules: never offer compensation; do not
ask for contract interaction until the registry is deployed + verified; the
first-touch ask is consent/interest only. Adapt channel to target (GitHub
issue/discussion, X DM, Telegram — whatever their repo/profile advertises).

### 1. Reckon (measured — score 72, 1537ms tools/list)

> Subject: Probe receipt for Reckon — measured Agent ID service evidence
>
> Hi — I'm validating Probe Receipts for the Agent ID ecosystem. We measured
> Reckon's public MCP interface on Nov 27 as a single-shot interface-health
> check: HTTP 200, 1537ms tools/list response. The exact evidence and
> methodology: https://databard.persidian.com/probe/receipts/reckon-mcp-ad747ad662.json
>
> Honest scope: this is an interface-health measurement, not a review or proof
> of tool-output correctness. We're preparing an Agent ID-gated receipt
> registry where holders can request Probe measurement and measured receipts
> get anchored on-chain. Would you like your receipt anchored once the
> contract is live, or prefer to be left out of the public index?
>
> Happy to share raw request/response evidence and correct anything
> mischaracterised.

### 2. MintBeacon (measured — score 77, 362ms)

Same structure; substitute: "HTTP 200, 362ms tools/list response" and
https://databard.persidian.com/probe/receipts/mintbeacon-mcp-ca2e7b86d6.json

### 3. Pokter (measured — score 77, 148ms; also the closest competitor)

Same structure; substitute: "HTTP 200, 148ms tools/list response" and
https://databard.persidian.com/probe/receipts/pokter-mcp-12b4993a5a.json
Add one honest line for Pokter only:

> You are the closest thing to a benchmark in this space — measured agent
> reliability is your thesis too. If you see the measurement model differently,
> I would rather hear it now than after the index ships.

### 4. SINCOR (agent-card confirmed, not yet measured)

> Subject: Agent ID service evidence — measuring SINCOR's public interface?
>
> Hi — I'm validating Probe Receipts for the Agent ID ecosystem: measured,
> dated, checkable evidence about whether agent services are worth paying.
> Your /.well-known/agent-card.json is live and machine-readable, which puts
> you ahead of most of the hackathon field. Would you be open to us measuring
> your public interface (single-shot, read-only, nothing stored beyond the
> measurement) and anchoring the receipt in the Agent ID-gated registry once
> it is live? Happy to share methodology and raw evidence first, and you can
> opt out of the public index entirely.

### 5. BGOAT (machine-readable manifest, not MCP)

> Subject: Receipts for machine-readable agent services
>
> Hi — validating Probe Receipts for the Agent ID ecosystem. BGOAT already
> publishes agent.json/agent.txt instructions, which is exactly the kind of
> machine-readability the ecosystem needs more of. Your surface is not an MCP
> endpoint, so we would not fake a quality measurement — but the registry can
> carry an honest "machine-readable manifest verified" style receipt. Want in
> once the contract is live, or prefer to sit out?

### 6–9. sqrJOBS / Agent Delegate / AgentTrust / AgentBoard (contract-only)

Hold until the registry is deployed — for contract-only projects the honest
offer is a "contract interaction verified, service unmeasured" receipt page,
and that page does not exist yet. Contact in the second wave, after deploy.

## Send order + conversion path

1. Send 1–3 today (measured, strongest evidence).
2. When the registry is live + verified, follow up with exact interaction
   instructions: one zero-value `requestProbe` contract call from their Agent
   ID wallet — calldata printed by `scripts/probe-receipt-request.mts`.
3. Log every reply (or non-reply after 48h) back into this file — the go/no-go
   gate counts real external wallets, not sends.

## Next validation actions

- Probe the three confirmed MCP services through the real Probe runner rather
  than only manual HTTP checks. **Done for `tools/list` interface health.** This
  does not yet prove tool-output correctness; before strong public quality
  claims, measure safe read-only tool invocations or label the receipt as
  interface health rather than end-to-end service quality.
- Define whether contract-only projects can receive an honest "unmeasured /
  contract-only" receipt page without implying quality measurement.
- Contact Reckon, MintBeacon, SINCOR, Pokter, BGOAT, sqrJOBS, Agent Delegate,
  AgentTrust, and the two AgentBoard projects first.
- Track whether any additional hackathon projects expose MCP, A2A agent cards,
  x402-paid endpoints, or machine-readable service manifests.
