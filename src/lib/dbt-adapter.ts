/**
 * dbt adapter — converts dbt manifest.json to our SchemaMeta format.
 * Supports dbt Cloud API and local manifest files.
 */
import type { SchemaMeta, TableMeta, ColumnMeta } from "./types";

interface DbtManifest {
  nodes: Record<string, DbtNode>;
  sources: Record<string, DbtSource>;
  metadata: { dbt_version: string };
}

interface DbtNode {
  unique_id: string;
  name: string;
  schema: string;
  database: string;
  description?: string;
  columns: Record<string, { name: string; data_type?: string; description?: string; tags?: string[] }>;
  tags?: string[];
  depends_on?: { nodes: string[] };
  meta?: { owner?: string };
}

interface DbtSource {
  unique_id: string;
  name: string;
  schema: string;
  database: string;
  description?: string;
  columns: Record<string, { name: string; data_type?: string; description?: string }>;
}

/**
 * Parse dbt manifest and extract schema metadata.
 * Groups models by schema.
 */
export function parseDbtManifest(manifest: DbtManifest, targetSchema?: string): SchemaMeta[] {
  const schemaMap = new Map<string, TableMeta[]>();

  // Process models
  for (const [id, node] of Object.entries(manifest.nodes)) {
    if (!id.startsWith("model.")) continue;
    
    const schemaFqn = `${node.database}.${node.schema}`;
    if (targetSchema && schemaFqn !== targetSchema) continue;

    const columns: ColumnMeta[] = Object.values(node.columns).map((col) => ({
      name: col.name,
      dataType: col.data_type ?? "unknown",
      description: col.description,
      tags: col.tags ?? [],
    }));

    const table: TableMeta = {
      fqn: `${schemaFqn}.${node.name}`,
      name: node.name,
      description: node.description,
      columns,
      qualityTests: [], // dbt tests would need separate parsing
      tags: node.tags ?? [],
    };

    if (!schemaMap.has(schemaFqn)) {
      schemaMap.set(schemaFqn, []);
    }
    schemaMap.get(schemaFqn)!.push(table);
  }

  // Convert to SchemaMeta array
  const schemas: SchemaMeta[] = [];
  for (const [fqn, tables] of schemaMap.entries()) {
    const name = fqn.split(".").pop() ?? fqn;
    
    // Build lineage from depends_on
    const lineage = [];
    for (const table of tables) {
      const node = Object.values(manifest.nodes).find((n) => n.name === table.name);
      if (node?.depends_on?.nodes) {
        for (const depId of node.depends_on.nodes) {
          const depNode = manifest.nodes[depId];
          if (depNode) {
            lineage.push({
              fromTable: `${depNode.database}.${depNode.schema}.${depNode.name}`,
              toTable: table.fqn,
            });
          }
        }
      }
    }

    schemas.push({ fqn, name, tables, lineage });
  }

  return schemas;
}

/**
 * Fetch dbt manifest from dbt Cloud API.
 */
export async function fetchDbtCloudManifest(
  accountId: string,
  projectId: string,
  token: string
): Promise<DbtManifest> {
  const url = `https://cloud.getdbt.com/api/v2/accounts/${accountId}/projects/${projectId}/artifacts/manifest.json`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!res.ok) {
    throw new Error(`dbt Cloud API error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}

/**
 * Load dbt manifest from local file (for development).
 */
export async function loadLocalManifest(path: string): Promise<DbtManifest> {
  const fs = await import("fs/promises");
  const content = await fs.readFile(path, "utf-8");
  return JSON.parse(content);
}
