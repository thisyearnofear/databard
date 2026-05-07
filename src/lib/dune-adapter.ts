/**
 * Dune Analytics adapter — fetches query metadata and result data from Dune API
 * and normalizes to SchemaMeta. Executes non-parameterized queries to compute
 * column statistics, enabling data-aware podcast narration.
 */
import type { SchemaMeta, TableMeta, ColumnMeta, QualityTest } from "./types";
import { metaCache } from "./store";

export interface DuneConfig {
  /** Dune API key — get one at https://dune.com/settings/api */
  apiKey: string;
  /** Dune team/user namespace to scope queries, e.g. "uniswap" */
  namespace?: string;
  /** Max queries to execute for result data (default 10) */
  maxExecuteQueries?: number;
}

interface DuneQuery {
  query_id: number;
  name: string;
  description?: string;
  tags?: string[];
  parameters?: { name: string; type: string }[];
  created_at?: string;
  updated_at?: string;
}

interface DuneResultColumn {
  name: string;
  type: string;
}

interface DuneResultMeta {
  column_names: string[];
  column_types: string[];
  row_count: number;
  result_set_bytes: number;
  total_row_count: number;
  datapoint_count: number;
  pending_time_millis?: number;
  execution_time_millis?: number;
}

interface DuneExecutionResponse {
  execution_id: string;
  state: string;
}

interface DuneExecutionResult {
  state: string;
  is_execution_finished: boolean;
  result?: {
    rows?: Record<string, unknown>[];
    metadata?: DuneResultMeta;
  };
  error?: { message: string; type: string };
}

export interface ColumnStats {
  nullCount: number;
  distinctCount: number;
  min?: number;
  max?: number;
  avg?: number;
  topValues?: { value: string; count: number }[];
}

export interface TableStatSummary {
  rowCount: number;
  columnHighlights: {
    column: string;
    type: "numeric" | "categorical";
    min?: number;
    max?: number;
    avg?: number;
    topValues?: string[];
  }[];
}

// ── Sidecar: result stats keyed by schema FQN, cleared after consumption ──
const duneStatsCache = new Map<string, Record<string, TableStatSummary>>();

/** Retrieve (and consume) result stats for a schema. Returns undefined if not available. */
export function getDuneTableStats(fqn: string): Record<string, TableStatSummary> | undefined {
  const stats = duneStatsCache.get(fqn);
  if (stats) duneStatsCache.delete(fqn);
  return stats;
}

const DUNE_API_BASE = "https://api.dune.com/api/v1";
const NUMERIC_TYPES = new Set(["int", "integer", "long", "bigint", "double", "float", "decimal", "number"]);

// ── HTTP helpers with retry + timeout ──

async function duneGet<T>(path: string, apiKey: string, retries = 3): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${DUNE_API_BASE}${path}`, {
        headers: { "X-Dune-API-Key": apiKey },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status >= 500 && attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`Dune API error: ${res.status} ${res.statusText}`);
      return res.json() as Promise<T>;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < retries - 1 && !(e instanceof Error && e.message.includes("40"))) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("Dune API: max retries exceeded");
}

async function dunePost<T>(path: string, body: Record<string, unknown>, apiKey: string): Promise<T> {
  const res = await fetch(`${DUNE_API_BASE}${path}`, {
    method: "POST",
    headers: { "X-Dune-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Dune API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Existing: fetch column metadata only ──

async function fetchQueryResultMeta(queryId: number, apiKey: string): Promise<DuneResultColumn[]> {
  try {
    const data = await duneGet<{ result?: { metadata?: DuneResultMeta } }>(
      `/query/${queryId}/results?limit=0`,
      apiKey
    );
    const meta = data.result?.metadata;
    if (!meta?.column_names) return [];
    return meta.column_names.map((name, i) => ({
      name,
      type: meta.column_types?.[i] ?? "unknown",
    }));
  } catch {
    return [];
  }
}

// ── New: execute query + poll for results ──

async function executeAndFetchResults(
  queryId: number,
  apiKey: string,
  options?: { sampleCount?: number; timeoutMs?: number }
): Promise<{ rows: Record<string, unknown>[]; meta: DuneResultMeta } | null> {
  const sampleCount = options?.sampleCount ?? 50;
  const timeoutMs = options?.timeoutMs ?? 120000;

  let executionId: string;
  try {
    const execRes = await dunePost<DuneExecutionResponse>(
      `/query/${queryId}/execute`,
      {},
      apiKey
    );
    executionId = execRes.execution_id;
  } catch {
    return null;
  }

  const deadline = Date.now() + timeoutMs;
  let backoff = 1000;
  const maxBackoff = 15000;

  while (Date.now() < deadline) {
    try {
      const result = await duneGet<DuneExecutionResult>(
        `/execution/${executionId}/results?sample_count=${sampleCount}`,
        apiKey
      );

      if (result.state === "QUERY_STATE_COMPLETED") {
        const rows = result.result?.rows ?? [];
        const meta = result.result?.metadata;
        if (!meta) return null;
        return { rows, meta };
      }

      if (result.state === "QUERY_STATE_FAILED" || result.state === "QUERY_STATE_CANCELLED") {
        return null;
      }
    } catch {
      // Transient error during polling — continue
    }

    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, maxBackoff);
  }

  return null; // Timeout
}

// ── New: compute column statistics from result rows ──

function computeColumnStats(
  rows: Record<string, unknown>[],
  meta: DuneResultMeta
): TableStatSummary {
  const columnHighlights: TableStatSummary["columnHighlights"] = [];

  for (let i = 0; i < meta.column_names.length; i++) {
    const colName = meta.column_names[i];
    const colType = (meta.column_types?.[i] ?? "unknown").toLowerCase();
    const isNumeric = NUMERIC_TYPES.has(colType);

    let nullCount = 0;
    const distinct = new Map<string, number>();
    let numMin = Infinity;
    let numMax = -Infinity;
    let numSum = 0;
    let numCount = 0;

    for (const row of rows) {
      const val = row[colName];
      if (val === null || val === undefined) {
        nullCount++;
        continue;
      }
      const strVal = String(val);
      distinct.set(strVal, (distinct.get(strVal) ?? 0) + 1);

      if (isNumeric) {
        const num = Number(val);
        if (!isNaN(num)) {
          numMin = Math.min(numMin, num);
          numMax = Math.max(numMax, num);
          numSum += num;
          numCount++;
        }
      }
    }

    if (isNumeric && numCount > 0) {
      columnHighlights.push({
        column: colName,
        type: "numeric",
        min: numMin,
        max: numMax,
        avg: Math.round((numSum / numCount) * 100) / 100,
      });
    } else if (!isNumeric && distinct.size > 0) {
      const sorted = [...distinct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      columnHighlights.push({
        column: colName,
        type: "categorical",
        topValues: sorted.map(([v]) => v),
      });
    }
  }

  return {
    rowCount: meta.total_row_count ?? meta.row_count ?? rows.length,
    columnHighlights,
  };
}

// ── Helpers for building TableMeta from query metadata ──

async function buildTableMetaFromQuery(q: DuneQuery, apiKey: string, fqnPrefix: string, stats?: TableStatSummary): Promise<TableMeta> {
  const resultCols = await fetchQueryResultMeta(q.query_id, apiKey);

  const columns: ColumnMeta[] = resultCols.length > 0
    ? resultCols.map((col) => ({
        name: col.name,
        dataType: col.type,
        tags: [],
      }))
    : (q.parameters ?? []).map((p) => ({
        name: p.name,
        dataType: p.type,
        description: "Query parameter",
        tags: ["parameter"],
      }));

  const hasParameters = q.parameters && q.parameters.length > 0;

  // Quality tests
  const qualityTests: QualityTest[] = [];
  if (!q.description) {
    qualityTests.push({ name: "query_has_description", status: "Failed" });
  }
  if (resultCols.length === 0) {
    qualityTests.push({ name: "query_has_results", status: "Queued" });
  } else {
    qualityTests.push({ name: "query_has_results", status: "Success" });
  }
  if (hasParameters) {
    qualityTests.push({ name: "query_has_parameters", status: "Queued" });
  }
  if (stats) {
    qualityTests.push({
      name: "query_has_data",
      status: stats.rowCount > 0 ? "Success" : "Failed",
    });
  }

  return {
    fqn: `${fqnPrefix}.${q.query_id}`,
    name: q.name,
    description: q.description,
    columns,
    qualityTests,
    tags: [...(q.tags ?? []), "dune", "analytics"],
    freshness: q.updated_at,
    rowCount: stats?.rowCount,
  };
}

// ── Enhanced: fetch metadata + execute queries for result data ──

export async function fetchSingleDuneQuery(queryId: number, apiKey: string): Promise<SchemaMeta> {
  const cacheKey = `dune:query:${queryId}`;
  const cached = metaCache.get<SchemaMeta>(cacheKey);
  if (cached) return cached;

  const q = await duneGet<DuneQuery>(`/query/${queryId}`, apiKey);
  const fqn = `dune.query.${queryId}`;

  // Execute if no parameters
  let stats: TableStatSummary | undefined;
  if (!q.parameters || q.parameters.length === 0) {
    const result = await executeAndFetchResults(queryId, apiKey);
    if (result && result.rows.length > 0) {
      stats = computeColumnStats(result.rows, result.meta);
      duneStatsCache.set(fqn, { [q.name]: stats });
    }
  }

  const table = await buildTableMetaFromQuery(q, apiKey, "dune.query", stats);

  const result: SchemaMeta = {
    fqn,
    name: q.name,
    description: `Dune Query #${queryId}: ${q.name}`,
    tables: [table],
    lineage: [],
  };

  metaCache.set(cacheKey, result, 600);
  return result;
}

export async function fetchDuneMeta(config: DuneConfig, namespaceOverride?: string): Promise<SchemaMeta> {
  const namespace = namespaceOverride ?? config.namespace ?? "my";
  const fqn = `dune.${namespace}`;
  const cacheKey = `dune:${namespace}`;

  const cached = metaCache.get<SchemaMeta>(cacheKey);
  if (cached) return cached;

  // Fetch queries owned by the namespace
  const data = await duneGet<{ results?: DuneQuery[] }>(
    `/queries?filters=user_name%3D${encodeURIComponent(namespace)}&limit=50`,
    config.apiKey
  );

  const queries = data.results ?? [];

  // Select top N non-parameterized queries for execution (by recency)
  const maxExecute = config.maxExecuteQueries ?? 10;
  const executable = queries
    .filter((q) => !q.parameters || q.parameters.length === 0)
    .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())
    .slice(0, maxExecute);

  // Execute queries in parallel (concurrency limit 3)
  const statsMap = new Map<number, TableStatSummary>();
  const executeBatch = async (batch: DuneQuery[]) => {
    await Promise.all(
      batch.map(async (q) => {
        const result = await executeAndFetchResults(q.query_id, config.apiKey);
        if (result && result.rows.length > 0) {
          statsMap.set(q.query_id, computeColumnStats(result.rows, result.meta));
        }
      })
    );
  };

  for (let i = 0; i < executable.length; i += 3) {
    await executeBatch(executable.slice(i, i + 3));
  }

  // Build tables
  const tables: TableMeta[] = await Promise.all(
    queries.map((q) => buildTableMetaFromQuery(q, config.apiKey, fqn, statsMap.get(q.query_id)))
  );

  // Store stats in sidecar for script generator
  const tableStats: Record<string, TableStatSummary> = {};
  for (const [queryId, stats] of statsMap) {
    const tableName = queries.find((q) => q.query_id === queryId)?.name;
    if (tableName) tableStats[tableName] = stats;
  }
  if (Object.keys(tableStats).length > 0) {
    duneStatsCache.set(fqn, tableStats);
  }

  const result: SchemaMeta = {
    fqn,
    name: namespace,
    description: `Dune Analytics queries for ${namespace}`,
    tables,
    lineage: [],
  };

  metaCache.set(cacheKey, result, 1800);
  return result;
}

/** List available Dune namespaces — returns the configured namespace as a schema FQN */
export function listDuneSchemas(config: DuneConfig): string[] {
  const namespace = config.namespace ?? "my";
  return [`dune.${namespace}`];
}
