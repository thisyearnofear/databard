# Data Sources Architecture: First-Class Adapters + Coral Escape Hatch

## Design Principle

DataBard uses a **dual-path** data architecture optimised for the end user:

1. **First-class adapters** for the top 5 sources — deep integration with full feature support
2. **Coral as the "Bring Your Own Source" escape hatch** — lets users connect anything else via SQL without waiting on us to build an adapter

This is a user-first decision. First-class adapters deliver better error messages, deeper metadata extraction (lineage, PII, owners, profiler data), and zero extra dependencies. Coral gives users immediate access to the long tail of sources we haven't built adapters for yet.

## Tier 1: First-Class Adapters

These sources have dedicated adapters (`src/lib/<source>-adapter.ts`) with:
- Full `SchemaMeta` extraction (columns, quality tests, lineage, tags, owners)
- Source-specific error handling and validation
- No external binary required — pure HTTP/file-based

| Source | Adapter | Depth |
|---|---|---|
| OpenMetadata | `openmetadata.ts` | Tables, columns, PII tags, quality tests, lineage, owners, profiler, glossary |
| dbt (Cloud + Local) | `dbt-adapter.ts` | Manifest parsing, run results, model lineage, test status |
| The Graph | `the-graph-adapter.ts` | GraphQL introspection, entity-to-table mapping, cross-entity lineage |
| Dune Analytics | `dune-adapter.ts` | Query metadata, result execution, column statistics (min/max/avg) |

### Why dedicated adapters?

- **Reliability**: No dependency on a third-party CLI binary being installed and configured
- **Depth**: Each adapter extracts source-specific metadata that Coral's generic SQL interface can't surface (e.g., OpenMetadata lineage edges, dbt test status, The Graph entity relationships)
- **Error UX**: Source-specific error messages ("Your OM token expired" vs generic SQL failure)
- **Zero friction**: Users paste a URL + token and they're connected — no `brew install`, no `coral source add`

## Tier 2: Coral — The Long-Tail Connector

Coral is exposed as both a source and a **power-user tool** for joining across any combination of APIs, databases, and files.

| Use Case | Example |
|---|---|
| Sources we don't have adapters for | Salesforce, Jira, Postgres, Notion, Stripe |
| Cross-source joins | `SELECT * FROM github.issues JOIN slack.messages ON ...` |
| Local file analysis | CSV/JSON uploaded by user, joined with API data |
| Custom/internal APIs | User-written Coral source specs |

### Where Coral fits in the pipeline

```
User selects "Coral" source
  → Provides a SQL query (+ optional local files)
  → coral-adapter.ts executes via CLI or Gateway
  → Returns generic SchemaMeta (columns inferred from results)
  → Enters normal DataBard pipeline (analysis → script → audio)
```

### Tradeoffs vs first-class adapters

| | First-Class Adapter | Coral |
|---|---|---|
| Setup friction | URL + token | Install Coral + configure sources + write SQL |
| Metadata depth | Full (lineage, PII, tests, owners) | Columns + data types only |
| Error messages | Source-specific | Generic SQL errors |
| Dependency | None (HTTP) | Coral binary or gateway |
| Source coverage | 5 sources | 50+ sources |
| Cross-source joins | No | Yes |

## When to Promote Coral → First-Class

Graduation tracking is live (`src/lib/coral-graduation.ts`). The `/api/coral/preview` route fires `trackCoralUsage()` on every query, accumulating anonymous source counts in `data/coral-sources.json`. Sources crossing the threshold (10 requests) are flagged for Tier 1 promotion.

A source should get a dedicated adapter when:

1. **Usage signal**: Source crosses the graduation threshold in `coral-sources.json`
2. **Metadata depth**: The source has rich metadata (lineage, quality, ownership) that Coral's SQL can't surface
3. **Reliability requirement**: Enterprise users need guaranteed uptime without Coral as a dependency

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   metadata-adapter.ts                      │
│                  (unified entry point)                     │
├──────────────┬───────────┬──────────┬──────────┬─────────┤
│ OpenMetadata │    dbt    │The Graph │   Dune   │  Coral  │
│   (Tier 1)   │ (Tier 1)  │(Tier 1)  │ (Tier 1) │(Tier 2) │
│              │           │          │          │         │
│ Full depth   │Full depth │Full depth│Full depth│ Generic │
│ HTTP only    │File/HTTP  │GraphQL   │HTTP      │CLI/GW   │
└──────┬───────┴─────┬─────┴────┬─────┴────┬─────┴────┬────┘
       │             │          │          │          │
       ▼             ▼          ▼          ▼          ▼
   OM REST API   manifest   GraphQL    Dune REST   Coral SQL
                  .json    introspect    API       (any source)
```

## Future: Coral as Enhancement Layer

As Coral matures and gains richer metadata introspection, the line between tiers may blur. A future path:

- **Cross-source enrichment**: Use Coral to join a Tier 1 source with supplementary data (e.g., join OM tables with Jira tickets about those tables)
- **Validation layer**: Use Coral queries as custom quality tests on top of first-class adapter data
- **Migration path**: If a source starts in Coral and accumulates usage, graduate it to Tier 1 with a dedicated adapter

This keeps the product stable and reliable for the 80% case (Tier 1 adapters) while giving power users unlimited reach (Coral).

## Field-Sales Allocation Discovery: Future Source Model

The field-sales allocation hypothesis in [`docs/FIELD_SALES_ALLOCATION.md`](FIELD_SALES_ALLOCATION.md) requires a domain model that is different from `SchemaMeta`. It is not a current DataBard capability.

The initial pilot should prefer reviewed imports over broad connectors:

| Data class | Minimum data | Role in the analysis | Access default |
| --- | --- | --- | --- |
| Account master | Canonical school/account, location, segment, owner, potential inputs | Defines what can be prioritised | Scoped file export |
| Activity history | Account, rep, date, type, outcome, next step | Measures coverage and engagement | Scoped file export from the real activity system |
| Commercial outcomes | Account/customer, order/invoice/payment/credit status, amount, date | Validates whether recommendations correspond with outcomes | Read-only, minimum-field export |
| Message evidence | Authorised account-related messages and timestamps | Optional enrichment, not a default activity source of truth | Explicit opt-in and retention boundary |

### Connector graduation criteria

Potential future connectors include CRM, calendar, email, messaging, and accounting systems such as Xero or QuickBooks. They should only graduate from a controlled import when a pilot shows repeated demand and the connector can provide a stable, reviewable outcome link.

A dedicated commercial connector must provide:

1. **Source provenance:** connection identity, extraction timestamp, reporting period, and a snapshot fingerprint.
2. **Least privilege:** read-only scopes and only fields needed for the agreed decision.
3. **Entity reconciliation:** a reviewable mapping from source customer/contact to canonical account; ambiguous matches remain unresolved.
4. **Outcome semantics:** explicit distinction between orders, invoices, payments, renewals, refunds, and credit notes.
5. **Auditability:** the evidence view can show the source records and transformation version behind a recommendation.
6. **Lifecycle controls:** revocation, retention, export/deletion, and access logs.

### Accounting-system trust boundary

Accounting integrations should start as an outcome-reconciliation layer rather than a general-ledger ingestion layer. A Xero or QuickBooks API response is useful input, but it is not by itself a privacy-preserving proof for another party.

A content hash or an on-chain attestation can establish that DataBard analysed a particular snapshot without later alteration. It cannot establish that the underlying accounting records were truthful. That requires source provenance, a trusted connector or auditor, and a clear scope for what is being asserted.

Zero-knowledge proofs may later help a customer prove a narrowly defined aggregate or benchmark without revealing every invoice. They are only appropriate after the customer has identified that exact verification need; a transparent evidence trail and least-privilege access are the first trust mechanisms.
