/**
 * DataHub client — first-class adapter for DataHub's Context Platform (GMS).
 *
 * Reads the context graph through the DataHub GraphQL API (pure HTTP + fetch,
 * no SDK dependency): datasets, columns, tags, glossary terms, owners,
 * assertions (data quality), lineage, and last dataset profile (freshness +
 * row count). Output is a standard SchemaMeta, so the rest of the DataBard
 * pipeline (health score, trend narrative, script, audio) works unchanged.
 *
 * Source-specific error messages mirror the other first-class adapters:
 *   - "DataHub auth failed (401). Check your token and permissions."
 *   - "No DataHub tables found under schema ..." with a match hint
 *
 * Version resilience: assertion runs and the last profile are fetched
 * best-effort — if a query shape is unavailable on a given DataHub version,
 * the schema still loads (fewer quality tests / no freshness) instead of
 * failing the whole analysis.
 */
import type {
  ColumnMeta,
  DataHubConnection,
  LineageEdge,
  QualityTest,
  SchemaMeta,
  TableMeta,
} from "./types";
import { metaCache } from "./store";
import { createHash } from "crypto";

const GRAPHQL_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const PAGE_SIZE = 100;
const MAX_DATASETS = 1_000;
const FETCH_CONCURRENCY = 6;
const MAX_ASSERTION_RUN_LOOKUPS = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Connection helpers ──

function normalizeDhBaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if (parsed.pathname.endsWith("/api/graphql")) {
    parsed.pathname = parsed.pathname.replace(/\/api\/graphql$/, "");
  }
  if (!parsed.pathname) parsed.pathname = "/";
  return parsed.toString().replace(/\/+$/, "");
}

function dhGraphqlUrl(conn: DataHubConnection): string {
  return `${normalizeDhBaseUrl(conn.serverUrl)}/api/graphql`;
}

function connectionScopeKey(conn: DataHubConnection): string {
  const base = normalizeDhBaseUrl(conn.serverUrl);
  const tokenHash = conn.token
    ? createHash("sha256").update(conn.token).digest("hex").slice(0, 16)
    : "no-token";
  return `${base}:${tokenHash}`;
}

// ── GraphQL plumbing ──

/** Errors that must not be retried (auth, validation, GraphQL logical errors). */
class NonRetryableError extends Error {}

interface DhGraphqlResponse<T> {
  data?: T;
  errors?: { message: string; path?: (string | number)[] }[];
}

async function dhGraphql<T>(
  conn: DataHubConnection,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(dhGraphqlUrl(conn), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(conn.token ? { Authorization: `Bearer ${conn.token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new NonRetryableError(
            `DataHub auth failed (${res.status}). Check your token and permissions.`
          );
        }
        if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
          await sleep(1_000 * (attempt + 1));
          continue;
        }
        throw new NonRetryableError(`DataHub HTTP ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as DhGraphqlResponse<T>;
      if (json.errors?.length) {
        throw new NonRetryableError(`DataHub GraphQL error: ${json.errors[0].message}`);
      }
      if (json.data === undefined) {
        throw new NonRetryableError("DataHub returned no data");
      }
      return json.data;
    } catch (e) {
      if (e instanceof NonRetryableError) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES - 1) await sleep(1_000 * (attempt + 1));
    }
  }
  throw lastError ?? new Error("Unknown DataHub fetch error");
}

// ── Queries ──

const LIST_DATASETS_QUERY = /* GraphQL */ `
  query ListDatasets($start: Int, $count: Int) {
    listEntities(input: { type: DATASET, start: $start, count: $count }) {
      start
      count
      total
      searchResults {
        entity {
          urn
          ... on Dataset {
            name
            platform { name }
          }
        }
      }
    }
  }
`;

const DATASET_META_QUERY = /* GraphQL */ `
  query GetDataset($urn: String!) {
    dataset(urn: $urn) {
      urn
      name
      platform { name }
      properties { name description }
      editableProperties { description }
      schemaMetadata {
        name
        fields {
          fieldPath
          description
          nativeDataType
          type
          globalTags { tags { tag { name properties { name } } } }
          glossaryTerms { terms { term { name properties { name } } } }
        }
      }
      globalTags { tags { tag { name properties { name } } } }
      glossaryTerms { terms { term { name properties { name } } } }
      ownership {
        owners {
          type
          owner {
            urn
            ... on CorpUser { username properties { displayName fullName } }
            ... on CorpGroup { name properties { displayName } }
          }
        }
      }
      upstreamLineage { entities { entity { urn } } }
      downstreamLineage { entities { entity { urn } } }
    }
  }
`;

const LIST_ASSERTIONS_QUERY = /* GraphQL */ `
  query ListAssertions($entityUrn: String!, $start: Int, $count: Int) {
    listAssertions(input: { entityUrn: $entityUrn, start: $start, count: $count }) {
      total
      assertions { urn type description }
    }
  }
`;

const ASSERTION_RUNS_QUERY = /* GraphQL */ `
  query AssertionRuns($assertionUrn: String!, $start: Int, $count: Int) {
    assertion(urn: $assertionUrn) {
      urn
      runEvents(status: COMPLETE, start: $start, count: $count) {
        total
        runEvents {
          timestampMillis
          status
          result { type }
        }
      }
    }
  }
`;

const DATASET_PROFILE_QUERY = /* GraphQL */ `
  query DatasetProfile($urn: String!) {
    dataset(urn: $urn) {
      urn
      lastProfile { timestampMillis rowCount }
    }
  }
`;

// ── Response types ──

interface DhDatasetSummary {
  urn: string;
  name: string;
  platform?: { name?: string };
}

interface DhListEntitiesResponse {
  listEntities?: {
    start: number;
    count: number;
    total: number;
    searchResults: { entity?: DhDatasetSummary }[];
  };
}

interface DhTagNode {
  name?: string;
  properties?: { name?: string };
}

interface DhTermNode {
  name?: string;
  properties?: { name?: string };
}

interface DhField {
  fieldPath?: string;
  description?: string;
  nativeDataType?: string;
  type?: string;
  globalTags?: { tags?: { tag?: DhTagNode }[] };
  glossaryTerms?: { terms?: { term?: DhTermNode }[] };
}

interface DhOwnerNode {
  urn?: string;
  username?: string;
  name?: string;
  properties?: { displayName?: string; fullName?: string };
}

interface DhDatasetMetaNode {
  urn: string;
  name: string;
  platform?: { name?: string };
  properties?: { name?: string; description?: string };
  editableProperties?: { description?: string };
  schemaMetadata?: { name?: string; fields?: DhField[] };
  globalTags?: { tags?: { tag?: DhTagNode }[] };
  glossaryTerms?: { terms?: { term?: DhTermNode }[] };
  ownership?: { owners?: { type?: string; owner?: DhOwnerNode }[] };
  upstreamLineage?: { entities?: { entity?: { urn?: string } }[] };
  downstreamLineage?: { entities?: { entity?: { urn?: string } }[] };
}

interface DhAssertionRef {
  urn?: string;
  type?: string;
  description?: string;
}

interface DhAssertionRunEvent {
  timestampMillis?: number;
  status?: string;
  result?: { type?: string };
}

interface DhAssertionRunsResponse {
  assertion?: {
    urn?: string;
    runEvents?: { total?: number; runEvents?: DhAssertionRunEvent[] };
  };
}

interface DhProfileResponse {
  dataset?: { urn?: string; lastProfile?: { timestampMillis?: number; rowCount?: number } };
}

// ── Pure helpers (exported for unit tests) ──

/**
 * Parse a DataHub dataset URN:
 *   urn:li:dataset:(urn:li:dataPlatform:postgres,db.sales.customer,PROD)
 */
export function parseDatasetUrn(
  urn: string
): { platform?: string; name: string; env?: string } | null {
  const match = /^urn:li:dataset:\(urn:li:dataPlatform:([^,]+),([^,]+),([^)]+)\)$/.exec(urn);
  if (!match) return null;
  return { platform: match[1], name: match[2], env: match[3] };
}

/**
 * DataHub has no first-class schema entity. Datasets are named
 * db.schema.table (platform-dependent), so the schema FQN is derived by
 * stripping the last path segment. Returns null for single-segment names.
 */
export function deriveSchemaFqn(datasetName: string): string | null {
  const parts = datasetName.split(".");
  if (parts.length < 2) return null;
  parts.pop();
  return parts.join(".");
}

/** Enriched dataset metadata used as input to the pure SchemaMeta builder. */
export interface DataHubDatasetMeta {
  urn: string;
  name: string;
  platform?: string;
  description?: string;
  columns: ColumnMeta[];
  tags: string[];
  glossaryTerms: string[];
  owner?: string;
  rowCount?: number;
  freshness?: string;
  qualityTests: QualityTest[];
  upstream: string[];
  downstream: string[];
}

/**
 * Pure mapping from enriched DataHub datasets to a SchemaMeta — no I/O, so
 * the health/analysis pipeline and unit tests share the exact same semantics.
 */
export function buildSchemaMeta(
  schemaFqn: string,
  datasets: DataHubDatasetMeta[]
): SchemaMeta {
  // Resolve lineage endpoints to readable dataset names (urn → name).
  const urnToName = new Map<string, string>();
  for (const d of datasets) urnToName.set(d.urn, d.name);
  for (const d of datasets) {
    for (const urn of [...d.upstream, ...d.downstream]) {
      const parsed = parseDatasetUrn(urn);
      if (parsed && !urnToName.has(urn)) urnToName.set(urn, parsed.name);
    }
  }

  const tables: TableMeta[] = datasets.map((d) => ({
    fqn: d.urn,
    name: d.name,
    description: d.description,
    columns: d.columns,
    qualityTests: d.qualityTests,
    tags: d.tags,
    owner: d.owner,
    rowCount: d.rowCount,
    freshness: d.freshness,
    glossaryTerms: d.glossaryTerms.length > 0 ? [...new Set(d.glossaryTerms)] : undefined,
    piiColumns: piiColumnsFromColumns(d.columns),
  }));

  const lineageKeys = new Set<string>();
  const lineage: LineageEdge[] = [];
  for (const d of datasets) {
    for (const urn of d.upstream) {
      const from = urnToName.get(urn);
      if (!from || from === d.name) continue;
      const key = `${from}->${d.name}`;
      if (lineageKeys.has(key)) continue;
      lineageKeys.add(key);
      lineage.push({ fromTable: from, toTable: d.name });
    }
    for (const urn of d.downstream) {
      const to = urnToName.get(urn);
      if (!to || to === d.name) continue;
      const key = `${d.name}->${to}`;
      if (lineageKeys.has(key)) continue;
      lineageKeys.add(key);
      lineage.push({ fromTable: d.name, toTable: to });
    }
  }

  return {
    fqn: schemaFqn,
    name: schemaFqn.split(".").pop() ?? schemaFqn,
    tables,
    lineage,
  };
}

function piiColumnsFromColumns(columns: ColumnMeta[]): string[] | undefined {
  const pii: string[] = [];
  for (const c of columns) {
    if (
      c.tags.some(
        (t) =>
          t.toLowerCase().includes("pii") ||
          t.toLowerCase().includes("sensitive") ||
          t.toLowerCase().includes("personal")
      )
    ) {
      if (!pii.includes(c.name)) pii.push(c.name);
    }
  }
  return pii.length > 0 ? pii : undefined;
}

// ── Dataset discovery ──

async function listAllDatasets(conn: DataHubConnection): Promise<DhDatasetSummary[]> {
  const results: DhDatasetSummary[] = [];
  let start = 0;
  while (results.length < MAX_DATASETS) {
    const data = await dhGraphql<DhListEntitiesResponse>(conn, LIST_DATASETS_QUERY, {
      start,
      count: PAGE_SIZE,
    });
    const list = data?.listEntities;
    const page = list?.searchResults ?? [];
    for (const r of page) {
      const entity = r?.entity;
      if (entity?.urn?.startsWith("urn:li:dataset:")) results.push(entity);
    }
    const total = list?.total ?? 0;
    if (page.length === 0 || (total > 0 && start + page.length >= total)) break;
    start += page.length;
  }
  return results;
}

/** Same dataset may exist in PROD + DEV — prefer PROD, then DEV, then others. */
function preferEnvironment(datasets: DhDatasetSummary[]): DhDatasetSummary[] {
  const groups = new Map<string, DhDatasetSummary[]>();
  for (const d of datasets) {
    groups.set(d.name, [...(groups.get(d.name) ?? []), d]);
  }
  const rank = (env?: string) => (env === "PROD" ? 0 : env === "DEV" ? 1 : 2);
  return [...groups.values()].map((group) =>
    group.sort(
      (a, b) => rank(parseDatasetUrn(a.urn)?.env) - rank(parseDatasetUrn(b.urn)?.env)
    )[0]
  );
}

// ── Per-dataset enrichment ──

async function fetchAssertions(conn: DataHubConnection, entityUrn: string): Promise<QualityTest[]> {
  const data = await dhGraphql<{ listAssertions?: { assertions?: DhAssertionRef[] } }>(
    conn,
    LIST_ASSERTIONS_QUERY,
    { entityUrn, start: 0, count: 100 }
  );
  const refs = data?.listAssertions?.assertions ?? [];
  if (refs.length === 0) return [];

  const latestRunByUrn = new Map<string, DhAssertionRunEvent>();
  await Promise.all(
    refs.slice(0, MAX_ASSERTION_RUN_LOOKUPS).map(async (a) => {
      if (!a.urn) return;
      try {
        const runs = await dhGraphql<DhAssertionRunsResponse>(conn, ASSERTION_RUNS_QUERY, {
          assertionUrn: a.urn,
          start: 0,
          count: 1,
        });
        const first = runs?.assertion?.runEvents?.runEvents?.[0];
        if (first) latestRunByUrn.set(a.urn, first);
      } catch {
        // Best-effort — the assertion stays "Queued" below rather than failing the schema.
      }
    })
  );

  return refs.map((a) => {
    const run = a.urn ? latestRunByUrn.get(a.urn) : undefined;
    const name = a.description || a.urn || "assertion";
    if (!run) return { name, status: "Queued" as const };
    return {
      name,
      status: run.result?.type === "SUCCESS" ? ("Success" as const) : ("Failed" as const),
    };
  });
}

async function fetchLastProfile(
  conn: DataHubConnection,
  urn: string
): Promise<{ rowCount?: number; timestampMillis?: number } | undefined> {
  const data = await dhGraphql<DhProfileResponse>(conn, DATASET_PROFILE_QUERY, { urn });
  return data?.dataset?.lastProfile;
}

async function fetchDatasetMeta(conn: DataHubConnection, urn: string): Promise<DataHubDatasetMeta> {
  const data = await dhGraphql<{ dataset?: DhDatasetMetaNode }>(conn, DATASET_META_QUERY, { urn });
  const ds = data?.dataset;
  if (!ds) throw new Error(`DataHub dataset not found: ${urn}`);

  const columns: ColumnMeta[] = [];
  for (const f of ds.schemaMetadata?.fields ?? []) {
    const fieldPath = f.fieldPath ?? "";
    columns.push({
      name: fieldPath.split(".").pop() ?? fieldPath,
      dataType: f.nativeDataType ?? f.type ?? "unknown",
      description: f.description,
      tags: (f.globalTags?.tags ?? [])
        .map((t) => t.tag?.properties?.name ?? t.tag?.name ?? "")
        .filter((t): t is string => Boolean(t)),
    });
  }

  const tableTags = (ds.globalTags?.tags ?? [])
    .map((t) => t.tag?.properties?.name ?? t.tag?.name ?? "")
    .filter((t): t is string => Boolean(t));

  const glossaryTerms = [
    ...(ds.glossaryTerms?.terms ?? []).map((t) => t.term?.properties?.name ?? t.term?.name ?? ""),
    ...(ds.schemaMetadata?.fields ?? []).flatMap((f) =>
      (f.glossaryTerms?.terms ?? []).map((t) => t.term?.properties?.name ?? t.term?.name ?? "")
    ),
  ].filter((t): t is string => Boolean(t));

  const owner = (ds.ownership?.owners ?? [])
    .map(
      (o) =>
        o.owner?.properties?.displayName ??
        o.owner?.properties?.fullName ??
        o.owner?.username ??
        o.owner?.name
    )
    .find((name): name is string => Boolean(name));

  const upstream = (ds.upstreamLineage?.entities ?? [])
    .map((e) => e.entity?.urn)
    .filter((u): u is string => Boolean(u));
  const downstream = (ds.downstreamLineage?.entities ?? [])
    .map((e) => e.entity?.urn)
    .filter((u): u is string => Boolean(u));

  // Best-effort enrichment — degrade gracefully instead of failing the schema.
  const [assertions, profile] = await Promise.all([
    fetchAssertions(conn, urn).catch(() => [] as QualityTest[]),
    fetchLastProfile(conn, urn).catch(() => undefined),
  ]);

  return {
    urn: ds.urn,
    name: ds.name,
    platform: ds.platform?.name,
    description: ds.editableProperties?.description ?? ds.properties?.description,
    columns,
    tags: tableTags,
    glossaryTerms: [...new Set(glossaryTerms)],
    owner,
    rowCount: profile?.rowCount,
    freshness: profile?.timestampMillis ? new Date(profile.timestampMillis).toISOString() : undefined,
    qualityTests: assertions,
    upstream,
    downstream,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Public API ──

export async function listSchemas(conn: DataHubConnection): Promise<string[]> {
  const cacheKey = `dh:schemas:${connectionScopeKey(conn)}`;
  const cached = metaCache.get<string[]>(cacheKey);
  if (cached) return cached;

  const datasets = await listAllDatasets(conn);
  const schemaSet = new Set<string>();
  for (const d of datasets) {
    const schema = deriveSchemaFqn(d.name);
    if (schema) schemaSet.add(schema);
  }
  const schemas = [...schemaSet].sort();
  metaCache.set(cacheKey, schemas, 300);
  return schemas;
}

export async function fetchSchemaMeta(conn: DataHubConnection, schemaFqn: string): Promise<SchemaMeta> {
  const cacheKey = `dh:schema:${connectionScopeKey(conn)}:${schemaFqn}`;
  const cached = metaCache.get<SchemaMeta>(cacheKey);
  if (cached) return cached;

  const datasets = await listAllDatasets(conn);
  const matches = preferEnvironment(
    datasets.filter((d) => deriveSchemaFqn(d.name) === schemaFqn)
  );

  if (matches.length === 0) {
    throw new Error(
      `No DataHub tables found under schema "${schemaFqn}". ` +
        `DataHub has no first-class schema entity — the schema FQN is matched against ` +
        `dataset names (e.g. "db.sales" matches "db.sales.customer").`
    );
  }

  const metas = await mapWithConcurrency(
    matches,
    (m) => fetchDatasetMeta(conn, m.urn),
    FETCH_CONCURRENCY
  );
  const meta = buildSchemaMeta(schemaFqn, metas);
  metaCache.set(cacheKey, meta, 600);
  return meta;
}

// ── Write-back to the DataHub context graph ──

const ADD_TAG_MUTATION = /* GraphQL */ `
  mutation AddTag($resourceUrn: String!, $tagUrn: String!) {
    addTag(input: { resourceUrn: $resourceUrn, tagUrn: $tagUrn })
  }
`;

const UPDATE_DESCRIPTION_MUTATION = /* GraphQL */ `
  mutation UpdateDescription($description: String!, $resourceUrn: String!) {
    updateDescription(input: { description: $description, resourceUrn: $resourceUrn })
  }
`;

/** Attribution marker appended to dataset descriptions so our additions are legible + idempotent. */
export const DATABARD_MARKER = "— DataBard AI analyst:";

const HEALTH_TAGS: Record<string, string> = {
  healthy: "urn:li:tag:DataBard_Healthy",
  "at-risk": "urn:li:tag:DataBard_AtRisk",
  critical: "urn:li:tag:DataBard_Critical",
};

export interface WriteBackPlan {
  tags: string[];
  descriptionAppend?: string;
}

/**
 * Pure decision logic: what to write back for a single table. No I/O — the
 * mutation calls live in writeBackFindings. Exporting this makes the write-back
 * intent unit-testable without a live DataHub.
 */
export function planTableWriteBack(
  table: TableMeta,
  healthLabel: "healthy" | "at-risk" | "critical",
  summaryLine?: string
): WriteBackPlan {
  const tags: string[] = [HEALTH_TAGS[healthLabel] ?? HEALTH_TAGS["at-risk"]];
  if (!table.owner) tags.push("urn:li:tag:DataBard_Ownerless");
  if (table.qualityTests.length === 0) tags.push("urn:li:tag:DataBard_Untested");
  if (!table.description) tags.push("urn:li:tag:DataBard_Undocumented");
  if (isStale(table.freshness)) tags.push("urn:li:tag:DataBard_Stale");
  const descriptionAppend = summaryLine
    ? `\n\n${DATABARD_MARKER} ${summaryLine}`
    : undefined;
  return { tags: [...new Set(tags)], descriptionAppend };
}

function isStale(freshness?: string): boolean {
  if (!freshness) return false;
  const ageMs = Date.now() - new Date(freshness).getTime();
  return ageMs > 72 * 3600 * 1000;
}

/** Remove any previously-appended DataBard marker block (idempotency across runs). */
export function stripExistingMarker(description?: string | null): string {
  const d = description?.trimEnd() ?? "";
  const idx = d.lastIndexOf(`\n\n${DATABARD_MARKER}`);
  if (idx !== -1) return d.slice(0, idx).trimEnd();
  if (d.startsWith(DATABARD_MARKER)) return "";
  return d;
}

export interface WriteBackSummary {
  tablesTouched: number;
  tagsApplied: number;
  descriptionsUpdated: number;
  ownersAssigned: number;
  errors: number;
}

export interface WriteBackOptions {
  /** Write governance-grade auto-documentation to each dataset's description. Default true (idempotent). */
  applyDescriptions?: boolean;
  /** Assign a suggested DataBard-analyst owner to ownerless datasets. Default true (best-effort). */
  applyOwnership?: boolean;
}

/**
 * Write DataBard's findings back into the DataHub context graph:
 *  - Tag each table with its health band + defect tags (ownerless / untested /
 *    undocumented / stale) so the state is visible in the DataHub UI.
 *  - Optionally append an AI summary to each dataset's description — idempotent
 *    (an existing marker block is stripped before re-appending).
 * Best-effort per table: a failed tag/description on one table is counted in
 * `errors` and does not fail the whole call.
 */
export async function writeBackFindings(
  conn: DataHubConnection,
  meta: SchemaMeta,
  healthLabel: "healthy" | "at-risk" | "critical",
  options: WriteBackOptions = {},
  summaryLine?: string
): Promise<WriteBackSummary> {
  const { applyDescriptions = true, applyOwnership = true } = options;
  const summary: WriteBackSummary = {
    tablesTouched: 0,
    tagsApplied: 0,
    descriptionsUpdated: 0,
    ownersAssigned: 0,
    errors: 0,
  };

  await mapWithConcurrency(
    meta.tables,
    async (table) => {
      const plan = planTableWriteBack(table, healthLabel, summaryLine);
      let touched = false;

      for (const tagUrn of plan.tags) {
        try {
          await dhGraphql<Record<string, unknown>>(conn, ADD_TAG_MUTATION, {
            resourceUrn: table.fqn,
            tagUrn,
          });
          summary.tagsApplied++;
          touched = true;
        } catch {
          summary.errors++;
        }
      }

      if (applyDescriptions) {
        try {
          const doc = buildTableDocumentation(table, summaryLine);
          const base = stripExistingMarker(table.description);
          await dhGraphql<Record<string, unknown>>(conn, UPDATE_DESCRIPTION_MUTATION, {
            resourceUrn: table.fqn,
            description: base ? `${base.trimEnd()}\n\n${doc}` : doc,
          });
          summary.descriptionsUpdated++;
          touched = true;
        } catch {
          summary.errors++;
        }
      }

      if (applyOwnership) {
        const ownerUrn = suggestedOwnerUrn(table);
        if (ownerUrn) {
          try {
            await dhGraphql<Record<string, unknown>>(conn, ADD_OWNERSHIP_MUTATION, {
              resourceUrn: table.fqn,
              ownerUrn,
              type: "DATAOWNER",
            });
            summary.ownersAssigned++;
            touched = true;
          } catch {
            summary.errors++;
          }
        }
      }

      if (touched) summary.tablesTouched++;
    },
    FETCH_CONCURRENCY
  );

  return summary;
}

const ADD_OWNERSHIP_MUTATION = /* GraphQL */ `
  mutation AddOwnership($resourceUrn: String!, $ownerUrn: String!, $type: OwnershipType!) {
    addOwnership(input: { resourceUrn: $resourceUrn, ownerUrn: $ownerUrn, type: $type })
  }
`;

/**
 * Build a governance-grade documentation block for a table: name, existing
 * description, columns, ownership/tests state, and an attributed DataBard
 * summary line. The block ends with the DATABARD_MARKER so stripExistingMarker
 * can remove it on re-write (idempotent).
 */
export function buildTableDocumentation(table: TableMeta, summaryLine?: string): string {
  const lines: string[] = [`DataBard analysis — ${table.name}`];
  if (table.description && !table.description.includes("DataBard analysis")) lines.push(table.description.trim());

  const cols = (table.columns ?? []).map((c) => c.name).filter((n): n is string => Boolean(n));
  if (cols.length) {
    lines.push(`Columns: ${cols.slice(0, 14).join(", ")}${cols.length > 14 ? ` and ${cols.length - 14} more` : ""}.`);
  }

  const state: string[] = [];
  state.push(table.owner ? `owned by ${table.owner}` : "unowned");
  const failing = (table.qualityTests ?? []).filter((q) => q.status === "Failed").length;
  state.push(table.qualityTests?.length ? `${table.qualityTests.length} test(s), ${failing} failing` : "untested");
  if (!table.description) state.push("undocumented");
  lines.push(`State: ${state.join(" · ")}.`);

  const issues: string[] = [];
  if (!table.owner) issues.push("no owner");
  if (!table.qualityTests?.length) issues.push("untested");
  if (!table.description) issues.push("undocumented");
  if (failing > 0) issues.push("failing tests");
  if (issues.length) lines.push(`Needs attention: ${issues.join(", ")}.`);

  if (summaryLine) lines.push(`${DATABARD_MARKER} ${summaryLine}`);
  return lines.join("\n");
}

/** Datasets with no owner get a suggested DataBard-analyst owner written to the graph. */
export function suggestedOwnerUrn(table: TableMeta): string | undefined {
  return table.owner ? undefined : "urn:li:corpuser:databard";
}

/**
 * Fetch the FULL DataHub context graph as enriched dataset metadata — every
 * dataset in the GMS — for fleet-level ("town hall") analysis. Cached per
 * connection for 5 minutes.
 */
export async function fetchFleetDatasets(conn: DataHubConnection): Promise<DataHubDatasetMeta[]> {
  const cacheKey = `dh:fleet:${connectionScopeKey(conn)}`;
  const cached = metaCache.get<DataHubDatasetMeta[]>(cacheKey);
  if (cached) return cached;

  const datasets = await listAllDatasets(conn);
  const metas = await mapWithConcurrency(datasets, (d) => fetchDatasetMeta(conn, d.urn), FETCH_CONCURRENCY);
  metaCache.set(cacheKey, metas, 300);
  return metas;
}


