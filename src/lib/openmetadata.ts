/**
 * OpenMetadata client — all OM API interactions in one place.
 * Used by both /api/connect and /api/metadata routes (DRY).
 */
import type { OMConnection, SchemaMeta, TableMeta, ColumnMeta, QualityTest, LineageEdge } from "./types";

async function omFetch<T>(conn: OMConnection, path: string): Promise<T | null> {
  const res = await fetch(`${conn.url}${path}`, {
    headers: { Authorization: `Bearer ${conn.token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

interface OMListResponse<T> { data: T[]; paging?: { total: number } }
interface OMDatabase { fullyQualifiedName: string; name: string }
interface OMSchema { fullyQualifiedName: string; name: string; description?: string }
interface OMTable {
  id: string;
  fullyQualifiedName: string;
  name: string;
  description?: string;
  columns?: { name: string; dataType: string; description?: string; tags?: { tagFQN: string }[] }[];
  tags?: { tagFQN: string }[];
}
interface OMTestCase { name: string; testCaseResult?: { testCaseStatus: string }; entityLink?: string }
interface OMLineageResponse { downstreamEdges?: { toEntity: { fqn: string } }[]; upstreamEdges?: { fromEntity: { fqn: string } }[] }

/** List all schema FQNs — used by /api/connect */
export async function listSchemas(conn: OMConnection): Promise<string[]> {
  const dbs = await omFetch<OMListResponse<OMDatabase>>(conn, "/api/v1/databases?limit=100");
  if (!dbs) return [];

  const schemas: string[] = [];
  for (const db of dbs.data ?? []) {
    const s = await omFetch<OMListResponse<OMSchema>>(
      conn,
      `/api/v1/databaseSchemas?database=${db.fullyQualifiedName}&limit=100`
    );
    for (const schema of s?.data ?? []) {
      schemas.push(schema.fullyQualifiedName);
    }
  }
  return schemas;
}

/** Fetch rich metadata for a schema — tables, columns, quality, lineage, tags */
export async function fetchSchemaMeta(conn: OMConnection, schemaFqn: string): Promise<SchemaMeta> {
  const parts = schemaFqn.split(".");
  const schemaName = parts[parts.length - 1];

  // Fetch tables with columns and tags
  const tablesRes = await omFetch<OMListResponse<OMTable>>(
    conn,
    `/api/v1/tables?databaseSchema=${schemaFqn}&limit=100&fields=columns,tags`
  );

  const tables: TableMeta[] = [];
  const allLineage: LineageEdge[] = [];

  for (const t of tablesRes?.data ?? []) {
    // Quality tests for this table
    const tests = await omFetch<OMListResponse<OMTestCase>>(
      conn,
      `/api/v1/dataQuality/testCases?entityLink=<#E::table::${t.fullyQualifiedName}>&limit=100`
    );

    const qualityTests: QualityTest[] = (tests?.data ?? []).map((tc) => ({
      name: tc.name,
      status: (tc.testCaseResult?.testCaseStatus as QualityTest["status"]) ?? "Queued",
      column: tc.entityLink?.match(/<#E::table::.*::(.+)>/)?.[1],
    }));

    const columns: ColumnMeta[] = (t.columns ?? []).map((c) => ({
      name: c.name,
      dataType: c.dataType,
      description: c.description,
      tags: (c.tags ?? []).map((tag) => tag.tagFQN),
    }));

    tables.push({
      fqn: t.fullyQualifiedName,
      name: t.name,
      description: t.description,
      columns,
      qualityTests,
      tags: (t.tags ?? []).map((tag) => tag.tagFQN),
    });

    // Lineage
    const lineage = await omFetch<OMLineageResponse>(
      conn,
      `/api/v1/lineage/table/name/${t.fullyQualifiedName}`
    );
    for (const edge of lineage?.downstreamEdges ?? []) {
      allLineage.push({ fromTable: t.fullyQualifiedName, toTable: edge.toEntity.fqn });
    }
    for (const edge of lineage?.upstreamEdges ?? []) {
      allLineage.push({ fromTable: edge.fromEntity.fqn, toTable: t.fullyQualifiedName });
    }
  }

  return { fqn: schemaFqn, name: schemaName, tables, lineage: allLineage };
}
