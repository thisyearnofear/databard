# Microsoft Purview Adapter — Tier-1 Specification

**Status: Specification — implementation scheduled.** No code exists yet; this document is the implementation contract for `src/lib/purview-adapter.ts`.

## Why Purview is a Tier-1 Candidate

The promotion criteria in [DATA_SOURCES_ARCHITECTURE.md](./DATA_SOURCES_ARCHITECTURE.md) require at least one of: graduation-threshold usage, rich metadata Coral can't surface, or an enterprise reliability requirement. Purview satisfies the latter two **by design**:

1. **Metadata depth**: Purview is Microsoft's enterprise data catalog — the Azure-native analogue of OpenMetadata. It exposes classifications (including built-in `MICROSOFT.PERSONAL.*` PII detectors), sensitivity labels, business glossary, ownership contacts, and Atlas-style lineage. None of this is reachable through Coral's generic SQL path.
2. **Reliability requirement**: Purview users are, almost definitionally, enterprise Azure shops. They expect a pure-HTTPS integration with no CLI binary and source-specific error messages ("Your Azure AD token expired / app registration lacks the Data Reader role" vs. a generic SQL failure).
3. **Usage signal**: Not yet applicable — Purview cannot be reached through Coral today, so graduation tracking can't fire for it. The candidacy rests on criteria 1 and 2.

Like every Tier-1 adapter, Purview integration is pure HTTP (Atlas-style REST at `https://{accountName}.purview.azure.com`) plus one OAuth2 token call — no external dependency.

## Adapter Contract

Module-level async functions (not classes), mirroring `src/lib/openmetadata.ts`:

```
listPurviewSchemas(conn: PurviewConnection): Promise<string[]>
fetchPurviewMeta(conn: PurviewConnection, schemaFqn: string): Promise<SchemaMeta>
```

Both normalize into `SchemaMeta` / `TableMeta` / `ColumnMeta` / `QualityTest` / `LineageEdge` from `src/lib/types.ts`.

## PurviewConnection Shape

```ts
export interface PurviewConnection {
  /** Account name ("contoso-purview") or full endpoint URL
   *  ("https://contoso-purview.purview.azure.com") — adapter normalizes. */
  endpoint: string;
  /** Azure AD app registration (client-credentials flow) */
  tenantId: string;
  clientId: string;
  clientSecret: string;
}
```

**Auth flow**: client-credentials grant against `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with scope `https://purview.azure.net/.default`. The resulting bearer token (~60 min lifetime) is cached in-module and refreshed on 401. The app registration needs the **Data Reader** role on the Purview account (or the relevant collections).

**Credential handling** follows the existing pattern for all Tier-1 sources: credentials are sent over HTTPS, held in the server-side session for the duration of the wizard flow, and never persisted to disk or logs.

## Endpoint → SchemaMeta Mapping

Base: `https://{accountName}.purview.azure.com`. Modern accounts use the `/datamap/api` prefix; older accounts expose the same Atlas surface under `/catalog/api`. The adapter should try `/datamap/api` first and fall back on 404.

| Target field | Purview API call | Notes |
|---|---|---|
| `listPurviewSchemas()` result | `POST /datamap/api/search/query` (discovery/search) or `GET /datamap/api/browse` | Enumerate table-like assets, group by qualifiedName prefix / collection (see FQN scheme below) |
| `SchemaMeta.tables` | `POST /datamap/api/search/query` filtered to the schema prefix, then `GET /datamap/api/atlas/v2/entity/bulk?guid=…` | Bulk entity fetch with `minExtInfo=false` returns columns via `referredEntities` |
| `TableMeta.name/fqn/description` | Entity `attributes.name`, `attributes.qualifiedName`, `attributes.description` / `userDescription` | Prefer `userDescription` (human-authored) over harvested `description` |
| `ColumnMeta` (name, dataType, description, tags) | Column entities in `referredEntities` (relationship `columns` / `tabular_schema`) | `attributes.data_type` → `dataType`; column classifications → `tags` |
| `TableMeta.piiColumns` + `tags` | `classifications[]` on table and column entities | Any `MICROSOFT.PERSONAL.*` classification or sensitivity label (`MICROSOFT.LABEL.*`) on a column marks it PII; classification `typeName`s become tags |
| `TableMeta.glossaryTerms` | Entity `relationshipAttributes.meanings[]` (term assignments); term detail via `GET /datamap/api/atlas/v2/glossary/term/{termGuid}` if display text is missing | Term `displayText` → `glossaryTerms` |
| `TableMeta.owner` | Entity `contacts.Owner[]` (fall back to `contacts.Expert[]`, then `attributes.owner`) | Contacts hold AAD object IDs; surface `info` field or the raw ID — do not call Graph API for resolution in v1 |
| `TableMeta.rowCount` / `freshness` | Entity `attributes` where the source scan populated them (e.g. `rowCount`, `sizeBytes`); `lastModifiedTS` / `updateTime` → `freshness` | Purview has no profiler API equivalent to OM's `/tableProfile`; leave `undefined` when absent |
| `SchemaMeta.lineage` | `GET /datamap/api/atlas/v2/lineage/{guid}?direction=BOTH&depth=1` per table | Walk `relations[]` through Process entities; resolve endpoint GUIDs to qualifiedNames via `guidEntityMap`; dedupe edges; skip edges pointing outside the schema's table set only if unresolvable |
| `TableMeta.qualityTests` | **No native API** — see below | |

### Quality tests: degradation

Purview has no native quality-test API (data quality lives in the separate Purview Data Quality / Data Estate Health surface, not the Atlas Data Map). Following The Graph / Dune convention, the adapter **synthesizes heuristic tests** per table rather than returning nothing:

| Synthesized test | Passes when |
|---|---|
| `has_description` | Table has a non-empty description or userDescription |
| `has_owner` | `contacts.Owner` is non-empty |
| `has_classification` | Table or any column carries at least one classification |

Each maps to `QualityTest { name, status: "Success" | "Failed" }`. If a future Purview DQ API becomes reachable, real results replace the heuristics.

### General degradation rules

Standard Tier-1 conventions apply: `lineage: []` when the lineage call fails or returns nothing; never throw on missing *optional* metadata (glossary, contacts, classifications) — log and continue; enrichment fields (`owner`, `rowCount`, `freshness`, `glossaryTerms`, `piiColumns`) are left `undefined` when the source doesn't supply them. Only auth failures and total unreachability are fatal.

## FQN Scheme — What "Schema" Means in Purview

Purview has no first-class "database schema" object; assets carry a source-native `qualifiedName` (e.g. `mssql://server.database.windows.net/db/dbo/customers`) and belong to a **collection**. The adapter defines a schema as a **qualifiedName prefix** — everything up to (but excluding) the table segment:

- `listPurviewSchemas()` runs a discovery search for table-like entity types (`azure_sql_table`, `databricks_table`, `azure_datalake_gen2_resource_set`, etc., paged), strips the final segment from each `qualifiedName`, and returns the deduplicated, sorted prefix list — e.g. `mssql://server.database.windows.net/salesdb/dbo`.
- `fetchPurviewMeta(conn, schemaFqn)` searches with that prefix as the filter and builds one `SchemaMeta` whose `name` is the trailing path segment (`dbo`) and whose `fqn` is the full prefix.

Collections are a viable alternative grouping; v1 uses qualifiedName prefixes because they map 1:1 onto the source's real schema hierarchy, matching what the OM adapter surfaces. Collection filtering can be added later as an optional connection field.

## Wiring Checklist — 6 Integration Points

| # | File | Change |
|---|---|---|
| 1 | `src/lib/types.ts` | Add `"purview"` to the `DataSource` union; add `PurviewConnection` interface; add `purview?: PurviewConnection` to `ConnectionConfig` |
| 2 | `src/lib/purview-adapter.ts` | New adapter — `listPurviewSchemas`, `fetchPurviewMeta` (this spec) |
| 3 | `src/lib/metadata-adapter.ts` | Dispatcher branches: `listSchemas` (~line 30) and `fetchSchemaMeta` (~line 52) |
| 4 | `src/app/api/connect/route.ts` | Validation branch (endpoint + tenantId + clientId + clientSecret present) and config passthrough (~lines 43–72) |
| 5 | `src/components/wizard/useGeneration.ts` | `buildBody` branch mapping wizard state → `ConnectionConfig.purview` (~lines 32–57) |
| 6 | Wizard UI | `WizardState` fields + reducer cases in `wizard-context.tsx`; `sourceLabel` / `sourceHelp` records (~lines 392–408 — exhaustive over `DataSource`, so TypeScript enforces the additions); `MAIN_SOURCES` in `ConnectStep.tsx` (~lines 222–232) plus the four connection input fields |

Point 6's exhaustive records mean the compiler flags every missed UI spot once `"purview"` lands in the union — the same safety net used for previous source additions.

## Caching, Pagination, Rate Limits, Errors

- **Caching**: mirror `openmetadata.ts` TTLs — schema list and per-schema `SchemaMeta` cached in-module for 300–600 s, keyed by `endpoint + schemaFqn`. The OAuth token is cached separately until ~5 min before expiry.
- **Pagination**: discovery search is paged via `limit`/`offset` (max 1000 per page; the search index caps offset+limit at 100k — well above any realistic schema). Bulk entity fetches are chunked at ≤100 GUIDs per request.
- **Rate limits**: the Data Map API throttles per-account (429 with `Retry-After`). Honor `Retry-After` with a single retry; on repeated 429, fail with a source-specific message rather than hanging the wizard.
- **Error UX**: distinguish (a) token acquisition failure → "Check tenantId/clientId/clientSecret"; (b) 403 from Purview → "App registration needs the Data Reader role on this Purview account"; (c) 404 on `/datamap/api` → retry `/catalog/api` before surfacing; (d) empty search results → valid connection, empty catalog (not an error).

## Effort Estimate

The OpenMetadata adapter is the direct template — same shape (paged REST, per-table enrichment, lineage resolution, caching), different endpoint names and auth. **Estimate: 2–3 days**, roughly: 1 day adapter + auth + normalization, 0.5 day wiring points 1/3/4/5, 0.5 day wizard UI, 0.5–1 day testing against a live Purview account (classifications, glossary, lineage fixtures).

## Azure Synergy

Paired with Azure OpenAI inference (see [AZURE.md](./AZURE.md)), this adapter makes DataBard natively consumable by Azure data teams end-to-end: metadata flows from Purview, narration is generated on Azure OpenAI, and nothing in the pipeline leaves the Azure trust boundary except by choice. For enterprises already standardized on Purview as their catalog of record, DataBard becomes a drop-in narration layer with zero new infrastructure.
