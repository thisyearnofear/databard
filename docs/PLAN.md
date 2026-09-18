# DataBard — Development Plan

*Rewritten 18 September 2026. Phases 1–9 are compressed history; the forward
roadmap reflects the two-front-door strategy (see [`STRATEGY.md`](STRATEGY.md)).*

## What We're Building

DataBard turns public data into public accounting: reports people share and
agents call — every finding dated, receipted, and checkable. Human front door:
public reports and commissioned editions. Machine front door: A2MCP tools with
x402 payment. One deterministic engine underneath; the wizard and its audio
briefings remain as a supporting surface.

## Where We Are (September 2026)

- **Live:** report-first landing with interactive examples; `/earn` directory +
  free previews; commissioned editions ($25 PUSD/SOL/USDC, pinned snapshot,
  receipt, attribution); `/superteam` showcase; `/league`; `/roast`; `/verify`.
- **Live (agents):** A2MCP tools — free `health-check`, $1 `briefing` (x402 on
  X Layer), $1 `probe` (service-quality oracle), `writeback`, `tools`
  discovery. Listed on OKX.AI; Monid adapter shipped. Real calls happening;
  volume unproven.
- **Kept, supporting:** the wizard (connect dbt, catalogs, Dune, subgraphs,
  DataHub, Monid → synthesis + optional audio briefing), Pro digests, alerts.
- **Honest gaps:** no proven edition sales yet; league live-scan cron still
  open; user interviews still owed (Phase 7 debt, carried into Phase 11).

## History (compressed)

| Phase | Era | Outcome |
|---|---|---|
| 1–2 | Hackathon core | Wizard, two-voice scripts, TTS, episode player, Stripe Pro |
| 3–4 | Analysis-first | Dashboard-first flow, trend narratives, format picker |
| 5 | Viral hooks | Share cards, Monday email, `/roast`, badges, event tracking |
| 6–6.8 | Solana demo + workspaces | `/verify`, Teams/Protocols split, Grove persistence, A2MCP tools, OKX ASP registered, `/league`, stay-alive cron |
| 7.1 | Portable evidence | Chain-neutral receipt, offline verification, Solana adapter (World's Fair slice) |
| 8 | Field-sales discovery | Parked vertical experiment ([`FIELD_SALES_ALLOCATION.md`](FIELD_SALES_ALLOCATION.md)) |
| 9 | Future list | Candidate tracker (parked), Azure, Purview |
| 9.5 | Public accounting pivot | `/superteam` showcase → parameterised `/earn` editions; PUSD + SOL/USDC checkout; anti-agency rule; OKX listing **approved**; Probe shipped; Monid "We Kill" submission; report-first landing replaces wizard-first |

## Forward Roadmap

### Phase 10: Public Record Identity — in progress

Make the product look like what it is: a registry of verifiable findings.

- [ ] Registry/visual identity pass across landing, report pages, publishing flow
- [ ] Report pages recast as dated filings; receipt presented as the seal
- [ ] Publish "seal lands" moment (real states only, no simulated progress)
- Gate: a cold visitor can say what DataBard is in one sentence after 10 seconds on `/`.

### Phase 11: Prove the Edition Loop

The edition is the business; prove the loop loops before building more of it.

- [ ] 5 user interviews (carried debt from Phase 7): sponsors + protocol data teams
- [ ] Manual outreach to the 10 most flattering Earn previews, one per day
- [ ] First 3 published editions from real customers (not us)
- [ ] Instrument preview → publish conversion and share rate; review weekly
- [ ] One hand-made 60s audio cut of the `/superteam` showcase as a share
      asset — the cheap test of whether the bard belongs on public reports
- Gate: evidence that a shared preview produces a new preview (loop), or a
  written post-mortem on why it doesn't.

### Phase 12: Datasets Beyond Earn (the unlock)

- [ ] Bring-your-own-dataset surface: Dune query, CSV, or API → accounting page
- [ ] Customer-defined entities + metrics whitelist; engine does the rest
- [ ] Receipt coverage for user-supplied sources, with provenance labels
- Gate: one external dataset produces a page its owner shares, with zero
  hand-curation from us (agency-creep tripwire).

### Phase 13: Sponsored Editions

- [ ] Named-sponsor slot on a flagship public artifact (league or ecosystem report)
- [ ] Media-model pricing; adjacency to a trusted artifact, never custom labour
- Gate: one paid sponsor, sold on the strength of Phase 11 distribution numbers.

### Phase 14: Agent-Economy Depth

- [ ] Public probe verdicts (the "Wirecutter for agent services" content engine)
- [ ] Free → paid conversion instrumentation on the A2MCP funnel
- [ ] Probe attestation volume on X Layer; OKX/Monid listing optimisation
- [ ] Monday live-scan cron for `/league` (carried from Phase 7)
- Gate: sustained weekly paid calls from agents we don't know personally.

### Parked (not the roadmap)

- Field-sales allocation vertical — [`FIELD_SALES_ALLOCATION.md`](FIELD_SALES_ALLOCATION.md)
- Candidate website tracker — [`CANDIDATE_TRACKER.md`](CANDIDATE_TRACKER.md)
- Azure migration — [`AZURE.md`](AZURE.md)
- Purview Tier-1 adapter — [`PURVIEW_ADAPTER.md`](PURVIEW_ADAPTER.md)
- Custom voice personalities, benchmarking, custom Anchor program

## Paper Canvas (developer tool)

The Paper.design MCP integration in `src/lib/paper-canvas.ts` renders dashboard
slides onto a live Paper canvas for design iteration. Requires Paper Desktop
locally; not used in the user-facing export path. The pure HTML builders remain
the single source of truth for preview and PDF export.
