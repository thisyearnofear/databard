/**
 * OpenMetadata client — deep integration with OM's APIs.
 * Fetches tables, columns, tags, owners, glossary terms, profiler data,
 * quality tests, lineage, and classification (PII).
 */
import type { OMConnection, SchemaMeta, TableMeta, ColumnMeta, QualityTest, LineageEdge } from "./types";
import { metaCache } from "./store";

async function omFetch<T>(conn: OMConnection, path: string, retries = 3): Promise<T | null> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${conn.url}${path}`, {
        headers: { Authorization: `Bearer ${conn.token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        if (res.status >= 500 && i < retries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
          continue;
        }
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res.json() as Promise<T>;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError ?? new Error("Unknown fetch error");
}

// ── OM API response types ──

interface OMList<T> { data: T[] }

interface OMDatabase { fullyQualifiedName: string; name: string }
interface OMSchema { fullyQualifiedName: string; name: string; description?: string }

interface OMOwner { name: string; displayName?: string; type: string }

interface OMTable {
  id: string;
  fullyQualifiedName: string;
  name: string;
  description?: string;
  owners?: OMOwner[];
  columns?: {
    name: string;
    dataType: string;
    description?: string;
    tags?: { tagFQN: string; labelType?: string }[];
    glossaryTerms?: { name: string; fullyQualifiedName: string }[];
  }[];
  tags?: { tagFQN: string; labelType?: string }[];
  glossaryTerms?: { name: string; fullyQualifiedName: string }[];
  profile?: { rowCount?: number; timestamp?: number };
}

interface OMTestCase {
  name: string;
  testCaseResult?: { testCaseStatus: string; timestamp?: number };
  entityLink?: string;
}

interface OMLineageResponse {
  downstreamEdges?: { toEntity: { fqn: string } }[];
  upstreamEdges?: { fromEntity: { fqn: string } }[];
}

// ── Public API ──

export async function listSchemas(conn: OMConnection): Promise<string[]> {
  const cacheKey = `om:schemas:${conn.url}`;
  const cached = metaCache.get<string[]>(cacheKey);
  if (cached) return cached;

  const dbs = await omFetch<OMList<OMDatabase>>(conn, "/api/v1/databases?limit=100");
  if (!dbs) return [];

  const schemas: string[] = [];
  for (const db of dbs.data ?? []) {
    const s = await omFetch<OMList<OMSchema>>(
      conn, `/api/v1/databaseSchemas?database=${db.fullyQualifiedName}&limit=100`
    );
    for (const schema of s?.data ?? []) {
      schemas.push(schema.fullyQualifiedName);
    }
  }

  metaCache.set(cacheKey, schemas, 300);
  return schemas;
}

/**
 * Fetch rich metadata for a schema — tables, columns, quality, lineage,
 * tags, owners, glossary terms, profiler data, PII classification.
 */
export async function fetchSchemaMeta(conn: OMConnection, schemaFqn: string): Promise<SchemaMeta> {
  const cacheKey = `om:schema:${conn.url}:${schemaFqn}`;
  const cached = metaCache.get<SchemaMeta>(cacheKey);
  if (cached) return cached;

  const schemaName = schemaFqn.split(".").pop() ?? schemaFqn;

  // Fetch tables with columns, tags, owners, profile
  const tablesRes = await omFetch<OMList<OMTable>>(
    conn,
    `/api/v1/tables?databaseSchema=${schemaFqn}&limit=100&fields=columns,tags,owners,profile,glossaryTerms`
  );

  if (!tablesRes?.data?.length) {
    throw new Error(`Schema not found or empty: ${schemaFqn}`);
  }

  // Fetch schema description
  const schemaInfo = await omFetch<OMSchema>(conn, `/api/v1/databaseSchemas/name/${schemaFqn}`);

  const tables: TableMeta[] = [];
  const allLineage: LineageEdge[] = [];

  for (const t of tablesRes.data) {
    // Quality tests
    const tests = await omFetch<OMList<OMTestCase>>(
      conn,
      `/api/v1/dataQuality/testCases?entityLink=<#E::table::${t.fullyQualifiedName}>&limit=100`
    );

    const qualityTests: QualityTest[] = (tests?.data ?? []).map((tc) => ({
      name: tc.name,
      status: (tc.testCaseResult?.testCaseStatus as QualityTest["status"]) ?? "Queued",
      column: tc.entityLink?.match(/<#E::table::.*::(.+)>/)?.[1],
    }));

    // Columns with PII detection
    const piiColumns: string[] = [];
    const columns: ColumnMeta[] = (t.columns ?? []).map((c) => {
      const tags = (c.tags ?? []).map((tag) => tag.tagFQN);
      // Detect PII-classified columns
      if (tags.some((tag) => tag.toLowerCase().includes("pii") || tag.toLowerCase().includes("sensitive") || tag.toLowerCase().includes("personal"))) {
        piiColumns.push(c.name);
      }
      return {
        name: c.name,
        dataType: c.dataType,
        description: c.description,
        tags,
      };
    });

    // Glossary terms (table-level + column-level)
    const glossaryTerms = [
      ...(t.glossaryTerms ?? []).map((g) => g.name),
      ...(t.columns ?? []).flatMap((c) => (c.glossaryTerms ?? []).map((g) => g.name)),
    ];

    // Owner
    const owner = t.owners?.[0]?.displayName ?? t.owners?.[0]?.name;

    // Profiler data — row count and freshness
    const rowCount = t.profile?.rowCount;
    const freshness = t.profile?.timestamp ? new Date(t.profile.timestamp).toISOString() : undefined;

    tables.push({
      fqn: t.fullyQualifiedName,
      name: t.name,
      description: t.description,
      columns,
      qualityTests,
      tags: (t.tags ?? []).map((tag) => tag.tagFQN),
      owner,
      rowCount,
      freshness,
      glossaryTerms: glossaryTerms.length > 0 ? [...new Set(glossaryTerms)] : undefined,
      piiColumns: piiColumns.length > 0 ? piiColumns : undefined,
    });

    // Lineage
    const lineage = await omFetch<OMLineageResponse>(
      conn, `/api/v1/lineage/table/name/${t.fullyQualifiedName}`
    );
    for (const edge of lineage?.downstreamEdges ?? []) {
      allLineage.push({ fromTable: t.fullyQualifiedName, toTable: edge.toEntity.fqn });
    }
    for (const edge of lineage?.upstreamEdges ?? []) {
      allLineage.push({ fromTable: edge.fromEntity.fqn, toTable: t.fullyQualifiedName });
    }
  }

  const meta: SchemaMeta = {
    fqn: schemaFqn,
    name: schemaName,
    description: schemaInfo?.description,
    tables,
    lineage: allLineage,
  };
  metaCache.set(cacheKey, meta, 600);
  return meta;
}
