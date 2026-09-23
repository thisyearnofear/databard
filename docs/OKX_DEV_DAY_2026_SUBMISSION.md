# OKX Dev Day 2026 — Submission copy

Working draft of the exact text for the submission form
(`https://forms.gle/81S2gnFCzqSoeDEA7`, deadline **25 Sep 2026, 23:59 UTC**).

- **Team:** udin (solo)
- **Project name:** DataBard Probe
- **Primary track:** Build a Company
- **Participation route:** Remote Build
- **Product link:** https://databard.persidian.com/probe
- **Service listing:** OKX.AI ASP #9878 (`databard_probe` via `GET /api/mcp/tools`)
- **Repo:** https://github.com/thisyearnofear/databard

---

## Project summary (form field, ~430 words)

DataBard Probe is a quality oracle for the agent economy: before an agent
pays another agent, it asks Probe whether the service is worth paying for.

**The problem.** The OKX.AI marketplace has the early App Store's cold-start
problem: a growing long tail of A2MCP services with no quality signal. Two
endpoints can both claim "token data" while differing wildly in latency,
schema richness, freshness and price. Today an agent pays blind and burns
budget on dead or low-value endpoints, asks a human (defeating the point of
an agent), or skips the capability entirely.

**The product.** Given a question and up to 10 candidate A2MCP endpoints,
Probe calls them all in parallel — paying each via x402 where required —
then scores every service on six normalised dimensions (schema completeness,
latency, freshness, price-per-value, reliability, credentials) and returns a
ranked verdict with a full cost receipt. With `attest: true`, the verdict
hash is anchored on X Layer, so a third agent can trust the score without
re-running (or re-paying for) the probe. A free preview route
(`POST /api/probe/preview`) runs the same scorer with payments disabled so
anyone can try it in a browser; the paid endpoint costs $1 per verdict with
a hard $0.50 cap on outbound spend, so margins are protected by
construction.

**Intended user.** Two doors: autonomous agents that call `databard_probe`
like any other A2MCP tool (full schemas in the OKX.AI service discovery
document), and humans evaluating services at `/probe`.

**Core integration.** OKX AI + X Layer end to end, on mainnet. DataBard is a
listed ASP (#9878); Probe pays real third-party OKX.AI services via the x402
Payment SDK, receives its own $1 fee via x402, and writes verdict
attestations to X Layer (eip155:196). Verified live on 18 Sep 2026: inbound
$1 settlement (tx 0x581d13…60a7), outbound payment to a third-party service
(0xeb22c2…63be6), verdict attestation anchored at block 70981029
(0x5519c3…ac7a59) — the full agent-to-agent money loop in one run.

**Built during the hackathon window (15–25 Sep):** the entire probe layer —
runner, six-dimension scorer, x402 client payments, X Layer attestation,
paid API route, free preview, `/probe` UI, SSRF guard, payment-aware
caching, spend caps — on top of our pre-existing ASP infrastructure. Commit
history on `main` from 15 Sep documents the work.

---

## Evidence links (for the form / reviewer)

| Artifact | Link / value |
|---|---|
| Live product | https://databard.persidian.com/probe |
| Free preview API | `POST https://databard.persidian.com/api/probe/preview` |
| Paid API (402 challenge) | `POST https://databard.persidian.com/api/agent/probe` |
| Tool discovery | `GET https://databard.persidian.com/api/mcp/tools` (`databard_probe`, `databard_service_score`) |
| Marketplace health index | https://databard.persidian.com/probe/marketplace — unpaid health check of all 152 listed A2MCP services |
| Index API | `GET https://databard.persidian.com/api/probe/marketplace` |
| Free pre-payment lookup | `POST https://databard.persidian.com/api/mcp/service-score` (`databard_service_score`) |
| Provider badge | `GET https://databard.persidian.com/api/probe/badge/{serviceId}` (shields SVG) |
| Inbound $1 settlement | X Layer tx `0x581d13568d3f44bd98a85943e20808e3a34b993ef4f719fc0fdf375e6edb60a7` (paymentId 15850923) |
| Outbound payment (third party) | X Layer tx `0xeb22c2362a861548b64fdc4eb0ee9275957ace28b916496e850040bedf163be6` |
| Verdict attestation | X Layer tx `0x5519c31276c8947e0144bd7bc35378f262c7a4ca0d98b3b3f41f5b7f6fac7a59`, block 70981029 |
| Probe wallet (auditable spend) | `0x49D551cA1F2532C82473b6c919d1a099ef5FA8D8` |
| Payment-flow screenshot | `demo-assets/devday-inbound-settlement.png`, `demo-assets/devday-attestation.png`, `demo-assets/devday-probe-results.png` |

## Remaining before 25 Sep

- [ ] Demo video (2–4 min) — script + recording
- [ ] Submit the form
- [ ] Optional: register `databard_probe` as a third service on ASP #9878 via
      onchainos (strengthens the "publish a working service" criterion)
