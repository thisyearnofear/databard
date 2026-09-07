# Candidate Website Tracker — Parked (Revisit After Monid)

> **Status: parked, not scheduled.** The Monid "We Kill" hackathon (deadline Sep 10,
> 2026), the OKX ASP listing finalisation, and Phase 7 validation all come first.
> Do not start any build work on this until those land. This doc exists so the
> brief and the reuse map aren't lost.

## The Brief (verbatim, Campaign Lab)

**Project Objective:** Campaign Lab scraped candidate websites during the 2024 general
election. Can we extend that work by revisiting those sites, comparing what has changed
over time, and creating a dataset of message shifts, deleted claims, new priorities and
campaign evolution? Can we also build out and maintain a database of candidates and
representatives and their websites.

**Project Details:** The previous candidate website scrape created a useful snapshot of
political messaging at one point in time. This challenge is to turn that snapshot into a
longitudinal dataset: identify which websites are still live, what content has changed,
what pages have disappeared, and whether candidate messaging shifts after elections,
scandals, office changes or local events.

**Useful outputs:** searchable archive, change log by candidate, topic modelling over
time, alerts for meaningful changes on candidate or MP websites.

**Skills called for:** web scraping, archiving, text comparison, data analysis.

## Alignment Verdict (Sep 2026)

Partial. The **shape** of the work is DataBard's pipeline applied to a new domain; the
**domain** is not the data-estate north star. Treat as a separate vertical experiment
(same framing as `FIELD_SALES_ALLOCATION.md` — "a separate vertical experiment, not a
replacement for the data-health roadmap"), not a pivot.

### What maps to shipped DataBard components

| Brief requirement | DataBard equivalent (already shipped) |
|---|---|
| Revisit sources, detect change | Trend diffs in `schema-analysis.ts`, "what changed this week", historical diff intros |
| Message shifts / new priorities | Synthesis engine (`script-generator.ts`, trend narratives) |
| Alerts for meaningful changes | Scheduled digests + `notifications.ts`, alerts subscriptions |
| Change log per candidate | Per-schema episodes with frozen snapshots, `/api/insights/trends` |
| Searchable archive | Episode store, league snapshots |
| Public accountability surface | `/league` scored public index pattern |
| Heterogeneous sources | Monid generic metered-endpoint adapter; Coral long-tail escape hatch |

"Deleted claims" ≈ "these tests stopped existing." The candidates/representatives
database ≈ the entity registry (FQNs, snapshots, freshness). The synthesis engine is the
differentiator: most trackers stop at raw diffs; narrating *what the shift means* is the
steak.

### What is net-new (the gap)

1. **Domain model mismatch.** `SchemaMeta` assumes structured tabular metadata. Website
   content is unstructured text → needs a new source type ("generic web page snapshot
   diff" adapter) not contemplated in `DATA_SOURCES_ARCHITECTURE.md`.
2. **Scraping muscle.** Crawlers, robots.txt/politeness, DOM-level page-change detection,
   Wayback Machine integration — none exists in the repo.
3. **Candidate DB + entity matching.** Maintained registry of candidates ↔ websites ↔
   representatives; identity reconciliation (uncertain matches surfaced, not silently
   merged — same principle as `FIELD_SALES_ALLOCATION.md` connector criteria).
4. **Topic modelling** over time — a genuinely new analysis layer beyond health scores.

## First Step When Unparked

Ask the brief's team for the **format of the 2024 scrape data**. That single fact
decides the scope: diff-over-JSON (reuse almost everything) vs. from-scratch rebuild.

## Open Questions

- Is Campaign Lab offering this as a funded engagement or a spec?
- Data-ownership/ethics boundary: scraping politician sites is public-interest work, but
  storage, retention, and "deleted claims" attribution need explicit policy before build.
- If it graduates, is the wedge a Campaign Lab source adapter (Tier 2) feeding the
  existing pipeline, or a separate app reusing the engine as a library?

## See Also

- `FIELD_SALES_ALLOCATION.md` — the precedent for parked vertical experiments
- `DATA_SOURCES_ARCHITECTURE.md` — where a "web snapshot diff" source would slot in
- `STRATEGY.md` — north star this must not displace
