# Outreach Kit — October 2026

Positioning from the Tavily differentiation pass. Lead with receipt + pinned
object + Probe. Never lead with audio or health score.

## Tested one-liners (pick one per message)

1. "Dated public accounting you can check — pages sponsors share, tools agents pay to call."
2. "Before an agent pays another agent, it asks DataBard — is this service worth it?"
3. "Dashboards show numbers. We publish findings with receipts."

Sharp jabs (use verbatim where it fits):
- vs observability: "$200k to catch breakage vs $25 to publish proof."
- vs Monid search: "Monid finds 1,700 tools. The top two for the same job differ 26× on price. We measure which one deserves the call."

## A. Sponsor outreach email (1/day, 10 most flattering previews)

Subject: your Earn numbers, receipted — `[Sponsor]` ranks [#N]

> Hi [Name],
>
> [Sponsor] has [N] Earn listings ([M] live now) totalling [$X in stablecoin
> rewards / N submissions]. We turned the public data into a dated,
> checkable page:
>
> [preview link]
>
> Every number carries a SHA-256 receipt — anyone can verify it at
> [verify link] without trusting us.
>
> If you want it pinned as a durable edition with "[Sponsor]" attribution
> ($25 one-off, permalink + share card), it's one click from the page.
>
> One question: did this surface something you didn't already know?
>
> — [You], DataBard

Log: sent date, preview→open, open→share, share→new preview (loop), publish.

## B. Probe one-pager (agent builders, OKX.AI / Monid)

**Before an agent pays another agent, it asks DataBard.**

- Monid lists 1,700+ tools; x402 Agent.market lets agents pay. Neither scores
  paid output quality. Same "read webpage" job: $0.02376 vs $0.0009 (26×)
  at the top of the list.
- Probe pays the x402 challenge, scores 6 dimensions (schema, latency,
  freshness, price/value, reliability, credentials), returns a ranked verdict
  + cost receipt + optional on-chain attestation.
- Free: public marketplace health index (`/probe/marketplace`) + shields
  badges + `databard_service_score` lookup tool. Paid: `$0.25` probe per
  question (repriced for the OKX relist).
- Honesty: `listing` (gate verified, no payment) vs `paid_delivery` (real
  settled check). Our own services excluded from aggregates.

Try: `POST /api/probe/preview` (free, no key) → `/probe` demo UI.

## C. Phase 11 scoreboard

| Metric | Target | Actual |
|---|---|---|
| Previews sent (1/day) | 10 | |
| Opens | — | |
| Shares (loop signal) | ≥3 producing a new preview | |
| Publishes ($25) | 3 real customers | |
| Paid Probe deep-check with settlement tx | 1 (`listing`→`paid_delivery`) | |
| Relist #9878 green | 402 self-check + activate | |

Gate: evidence a shared preview produces a new preview, or a written
post-mortem on why it doesn't.
