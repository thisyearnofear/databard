/**
 * dbt adapter — converts dbt manifest.json to our SchemaMeta format.
 * Supports dbt Cloud API and local manifest files.
 * Parses models, sources, tests, and lineage.
 */
import type { SchemaMeta, TableMeta, ColumnMeta, QualityTest } from "./types";
import { metaCache } from "./store";

interface DbtManifest {
  nodes: Record<string, DbtNode>;
  sources?: Record<string, DbtSource>;
  metadata: { dbt_version: string };
}

interface DbtNode {
  unique_id: string;
  resource_type: string;
  name: string;
  schema: string;
  database: string;
  description?: string;
  columns: Record<string, { name: string; data_type?: string; description?: string; tags?: string[] }>;
  tags?: string[];
  depends_on?: { nodes: string[] };
  test_metadata?: { name: string };
  config?: { severity?: string };
  meta?: Record<string, unknown>;
}

interface DbtSource {
  unique_id: string;
  name: string;
  source_name: string;
  schema: string;
  database: string;
  description?: string;
  columns: Record<string, { name: string; data_type?: string; description?: string }>;
}

interface DbtRunResults {
  results: { unique_id: string; status: string }[];
}

/** Build a lookup of test results per model/source unique_id */
function extractTests(manifest: DbtManifest, runResults?: DbtRunResults): Map<string, QualityTest[]> {
  const testMap = new Map<string, QualityTest[]>();

  // Build status lookup from run_results if available
  const statusByUniqueId = new Map<string, "Success" | "Failed">();
  if (runResults) {
    for (const result of runResults.results) {
      if (result.unique_id.startsWith("test.")) {
        statusByUniqueId.set(result.unique_id, result.status === "pass" ? "Success" : "Failed");
      }
    }
  }

  for (const [id, node] of Object.entries(manifest.nodes)) {
    if (node.resource_type !== "test" && !id.startsWith("test.")) continue;

    const deps = node.depends_on?.nodes ?? [];
    const testName = node.test_metadata?.name ?? node.name;
    const status = statusByUniqueId.get(id) ?? "Queued";

    const test: QualityTest = { name: testName, status };

    for (const depId of deps) {
      if (!testMap.has(depId)) testMap.set(depId, []);
      testMap.get(depId)!.push(test);
    }
  }

  return testMap;
}

/** Parse dbt manifest into SchemaMeta array. Optionally accepts run_results for test status. */
export function parseDbtManifest(manifest: DbtManifest, targetSchema?: string, runResults?: DbtRunResults): SchemaMeta[] {
  const testMap = extractTests(manifest, runResults);
  const schemaMap = new Map<string, TableMeta[]>();
  const nodeById = new Map<string, { fqn: string; schemaFqn: string }>();

  // Process models
  for (const [id, node] of Object.entries(manifest.nodes)) {
    if (node.resource_type !== "model" && !id.startsWith("model.")) continue;

    const schemaFqn = `${node.database}.${node.schema}`;
    if (targetSchema && schemaFqn !== targetSchema) continue;

    const tableFqn = `${schemaFqn}.${node.name}`;
    nodeById.set(id, { fqn: tableFqn, schemaFqn });

    const columns: ColumnMeta[] = Object.values(node.columns).map((col) => ({
      name: col.name,
      dataType: col.data_type ?? "unknown",
      description: col.description,
      tags: col.tags ?? [],
    }));

    if (!schemaMap.has(schemaFqn)) schemaMap.set(schemaFqn, []);
    schemaMap.get(schemaFqn)!.push({
      fqn: tableFqn,
      name: node.name,
      description: node.description,
      columns,
      qualityTests: testMap.get(id) ?? [],
      tags: node.tags ?? [],
    });
  }

  // Process sources
  for (const [id, src] of Object.entries(manifest.sources ?? {})) {
    const schemaFqn = `${src.database}.${src.schema}`;
    if (targetSchema && schemaFqn !== targetSchema) continue;

    const tableFqn = `${schemaFqn}.${src.name}`;
    nodeById.set(id, { fqn: tableFqn, schemaFqn });

    const columns: ColumnMeta[] = Object.values(src.columns).map((col) => ({
      name: col.name,
      dataType: col.data_type ?? "unknown",
      description: col.description,
      tags: [],
    }));

    if (!schemaMap.has(schemaFqn)) schemaMap.set(schemaFqn, []);
    schemaMap.get(schemaFqn)!.push({
      fqn: tableFqn,
      name: src.name,
      description: src.description,
      columns,
      qualityTests: testMap.get(id) ?? [],
      tags: [],
    });
  }

  // Build lineage using unique_id references — O(n)
  const fqnToId = new Map<string, string>();
  for (const [id, entry] of nodeById.entries()) {
    fqnToId.set(entry.fqn, id);
  }

  const schemas: SchemaMeta[] = [];
  for (const [fqn, tables] of schemaMap.entries()) {
    const lineage: { fromTable: string; toTable: string }[] = [];

    for (const table of tables) {
      const nodeId = fqnToId.get(table.fqn);
      if (!nodeId) continue;
      const node = manifest.nodes[nodeId];
      if (!node?.depends_on?.nodes) continue;

      for (const depId of node.depends_on.nodes) {
        const dep = nodeById.get(depId);
        if (dep) {
          lineage.push({ fromTable: dep.fqn, toTable: table.fqn });
        }
      }
    }

    schemas.push({
      fqn,
      name: fqn.split(".").pop() ?? fqn,
      tables,
      lineage,
    });
  }

  return schemas;
}

const MANIFEST_CACHE_TTL = 300; // 5 min

/** Fetch manifest + run_results from dbt Cloud, with caching */
export async function fetchDbtCloudManifest(
  accountId: string,
  projectId: string,
  token: string
): Promise<{ manifest: DbtManifest; runResults?: DbtRunResults }> {
  const cacheKey = `dbt:bundle:${accountId}:${projectId}`;
  const cached = metaCache.get<{ manifest: DbtManifest; runResults?: DbtRunResults }>(cacheKey);
  if (cached) return cached;

  const baseUrl = `https://cloud.getdbt.com/api/v2/accounts/${accountId}/projects/${projectId}/artifacts`;
  const headers = { Authorization: `Bearer ${token}` };

  const manifestRes = await fetch(`${baseUrl}/manifest.json`, { headers });
  if (!manifestRes.ok) throw new Error(`dbt Cloud API error: ${manifestRes.status} ${manifestRes.statusText}`);
  const manifest: DbtManifest = await manifestRes.json();

  let runResults: DbtRunResults | undefined;
  try {
    const rrRes = await fetch(`${baseUrl}/run_results.json`, { headers });
    if (rrRes.ok) runResults = await rrRes.json();
  } catch {
    // run_results not available — tests will show as "Queued"
  }

  const result = { manifest, runResults };
  metaCache.set(cacheKey, result, MANIFEST_CACHE_TTL);
  return result;
}

/** Load manifest from uploaded JSON content (no filesystem access needed) */
export function loadManifestFromContent(jsonContent: string): { manifest: DbtManifest; runResults?: DbtRunResults } {
  const manifest: DbtManifest = JSON.parse(jsonContent);
  return { manifest, runResults: undefined };
}

/** Load manifest + run_results from local files, with caching */
export async function loadLocalManifest(path: string): Promise<{ manifest: DbtManifest; runResults?: DbtRunResults }> {
  const cacheKey = `dbt:bundle:local:${path}`;
  const cached = metaCache.get<{ manifest: DbtManifest; runResults?: DbtRunResults }>(cacheKey);
  if (cached) return cached;

  const fs = await import("fs/promises");
  const content = await fs.readFile(path, "utf-8");
  const manifest: DbtManifest = JSON.parse(content);

  let runResults: DbtRunResults | undefined;
  try {
    const { dirname, join } = await import("path");
    const rrPath = join(dirname(path), "run_results.json");
    const rrContent = await fs.readFile(rrPath, "utf-8");
    runResults = JSON.parse(rrContent);
  } catch {
    // run_results not available
  }

  const result = { manifest, runResults };
  metaCache.set(cacheKey, result, MANIFEST_CACHE_TTL);
  return result;
}
