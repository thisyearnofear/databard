/**
 * Dune Analytics adapter — fetches dataset/query metadata from Dune API
 * and normalizes to SchemaMeta. Treats Dune datasets as schemas and
 * queries/tables as "tables" with result columns as "columns".
 */
import type { SchemaMeta, TableMeta, ColumnMeta, QualityTest } from "./types";

export interface DuneConfig {
  /** Dune API key — get one at https://dune.com/settings/api */
  apiKey: string;
  /** Dune team/user namespace to scope queries, e.g. "uniswap" */
  namespace?: string;
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

const DUNE_API_BASE = "https://api.dune.com/api/v1";

async function duneGet<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${DUNE_API_BASE}${path}`, {
    headers: { "X-Dune-API-Key": apiKey },
  });
  if (!res.ok) throw new Error(`Dune API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** Fetch metadata for a single Dune query execution result */
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

/** Fetch queries for a namespace and normalize to SchemaMeta */
export async function fetchDuneMeta(config: DuneConfig, namespaceOverride?: string): Promise<SchemaMeta> {
  const namespace = namespaceOverride ?? config.namespace ?? "my";
  const fqn = `dune.${namespace}`;

  // Fetch queries owned by the namespace
  const data = await duneGet<{ results?: DuneQuery[] }>(
    `/queries?filters=user_name%3D${encodeURIComponent(namespace)}&limit=50`,
    config.apiKey
  );

  const queries = data.results ?? [];

  const tables: TableMeta[] = await Promise.all(
    queries.map(async (q): Promise<TableMeta> => {
      const resultCols = await fetchQueryResultMeta(q.query_id, config.apiKey);

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

      // Quality checks: flag queries with no description or no result columns
      const qualityTests: QualityTest[] = [];
      if (!q.description) {
        qualityTests.push({ name: "query_has_description", status: "Failed" });
      }
      if (resultCols.length === 0) {
        qualityTests.push({ name: "query_has_results", status: "Queued" });
      }

      return {
        fqn: `${fqn}.${q.query_id}`,
        name: q.name,
        description: q.description,
        columns,
        qualityTests,
        tags: [...(q.tags ?? []), "dune", "analytics"],
        freshness: q.updated_at,
      };
    })
  );

  return {
    fqn,
    name: namespace,
    description: `Dune Analytics queries for ${namespace}`,
    tables,
    lineage: [], // Dune queries are independent; lineage not available via API
  };
}

/** List available Dune namespaces — returns the configured namespace as a schema FQN */
export function listDuneSchemas(config: DuneConfig): string[] {
  const namespace = config.namespace ?? "my";
  return [`dune.${namespace}`];
}
