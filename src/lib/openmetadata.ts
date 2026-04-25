/**
 * OpenMetadata client — deep integration with OM's APIs.
 * Fetches tables, columns, tags, owners, glossary terms, profiler data,
 * quality tests, lineage, and classification (PII).
 */
import type { OMConnection, SchemaMeta, TableMeta, ColumnMeta, QualityTest, LineageEdge } from "./types";
import { metaCache } from "./store";
import { createHash } from "crypto";

interface OMFetchOptions {
  retries?: number;
  optional404?: boolean;
}

function normalizeOmBaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if (/\/api(?:\/v1)?$/i.test(parsed.pathname)) {
    parsed.pathname = parsed.pathname.replace(/\/api(?:\/v1)?$/i, "");
  }
  if (!parsed.pathname) parsed.pathname = "/";
  return parsed.toString().replace(/\/+$/, "");
}

function buildOmUrl(conn: OMConnection, path: string, query?: Record<string, string | number | undefined>): string {
  const normalizedBase = normalizeOmBaseUrl(conn.url);
  const url = new URL(path, `${normalizedBase}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function connectionScopeKey(conn: OMConnection): string {
  const normalizedBase = normalizeOmBaseUrl(conn.url);
  const tokenHash = createHash("sha256").update(conn.token).digest("hex").slice(0, 16);
  return `${normalizedBase}:${tokenHash}`;
}

async function omFetch<T>(conn: OMConnection, path: string, options: OMFetchOptions = {}): Promise<T | null> {
  const { retries = 3, optional404 = false } = options;
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(buildOmUrl(conn, path), {
        headers: { Authorization: `Bearer ${conn.token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        if ((res.status === 401 || res.status === 403) && i === retries - 1) {
          throw new Error(`OpenMetadata auth failed (${res.status}). Check your token and permissions.`);
        }
        if (res.status >= 500 && i < retries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
          continue;
        }
        if (res.status === 404 && optional404) return null;
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

interface OMList<T> {
  data: T[];
  paging?: { after?: string | null };
}

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
  testSuite?: { id: string };
}

interface OMTestCase {
  name: string;
  testCaseResult?: { testCaseStatus: string; timestamp?: number };
  entityLink?: string;
}

interface OMLineageResponse {
  entity?: { id: string; type: string; fullyQualifiedName: string };
  nodes?: { id: string; type: string; fullyQualifiedName: string }[];
  downstreamEdges?: { fromEntity: string | { fqn?: string }; toEntity: string | { fqn?: string } }[];
  upstreamEdges?: { fromEntity: string | { fqn?: string }; toEntity: string | { fqn?: string } }[];
}

async function omFetchAllPages<T>(
  conn: OMConnection,
  path: string,
  query: Record<string, string | number | undefined>,
  options: OMFetchOptions = {}
): Promise<T[]> {
  const results: T[] = [];
  const baseQuery = { ...query };
  let after: string | undefined;
  do {
    const pageQuery = { ...baseQuery, after };
    const page = await omFetch<OMList<T>>(
      conn,
      `${path}?${new URLSearchParams(Object.entries(pageQuery).filter(([, value]) => value !== undefined) as [string, string][])}`,
      options
    );
    if (!page) break;
    results.push(...(page.data ?? []));
    after = page.paging?.after ? String(page.paging.after) : undefined;
  } while (after);

  return results;
}

function resolveLineageEntityFqn(
  value: string | { fqn?: string },
  nodeById: Map<string, { fqn: string; type: string }>
): { fqn?: string; type?: string } {
  if (typeof value === "string") {
    const node = nodeById.get(value);
    return { fqn: node?.fqn, type: node?.type };
  }
  return { fqn: value?.fqn };
}

// ── Public API ──

export async function listSchemas(conn: OMConnection): Promise<string[]> {
  const scope = connectionScopeKey(conn);
  const cacheKey = `om:schemas:${scope}`;
  const cached = metaCache.get<string[]>(cacheKey);
  if (cached) return cached;

  const dbs = await omFetchAllPages<OMDatabase>(conn, "/api/v1/databases", { limit: 100 });
  if (!dbs.length) return [];

  const schemas: string[] = [];
  for (const db of dbs) {
    const dbSchemas = await omFetchAllPages<OMSchema>(
      conn,
      "/api/v1/databaseSchemas",
      { database: db.fullyQualifiedName, limit: 100 }
    );
    for (const schema of dbSchemas) {
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
  const scope = connectionScopeKey(conn);
  const cacheKey = `om:schema:${scope}:${schemaFqn}`;
  const cached = metaCache.get<SchemaMeta>(cacheKey);
  if (cached) return cached;

  const schemaName = schemaFqn.split(".").pop() ?? schemaFqn;

  // Fetch tables with columns, tags, owners, profile
  const tablesData = await omFetchAllPages<OMTable>(
    conn,
    "/api/v1/tables",
    {
      databaseSchema: schemaFqn,
      limit: 100,
      fields: "columns,tags,owners,profile,testSuite",
    }
  );

  // Fetch schema description
  const schemaInfo = await omFetch<OMSchema>(conn, `/api/v1/databaseSchemas/name/${encodeURIComponent(schemaFqn)}`);

  const tables: TableMeta[] = [];
  const allLineage: LineageEdge[] = [];
  const lineageEdgeKeys = new Set<string>();

  for (const t of tablesData) {
    // Quality tests
    const tests = t.testSuite?.id
      ? await omFetchAllPages<OMTestCase>(
        conn,
        "/api/v1/dataQuality/testCases",
        { testSuiteId: t.testSuite.id, fields: "testCaseResult", limit: 100 },
        { optional404: true }
      )
      : await omFetchAllPages<OMTestCase>(
        conn,
        "/api/v1/dataQuality/testCases",
        { entityLink: `<#E::table::${t.fullyQualifiedName}>`, fields: "testCaseResult", limit: 100 },
        { optional404: true }
      );

    const qualityTests: QualityTest[] = tests.map((tc) => {
      const rawStatus = tc.testCaseResult?.testCaseStatus;
      const status: QualityTest["status"] =
        rawStatus === "Success" || rawStatus === "Failed" || rawStatus === "Aborted" || rawStatus === "Queued"
          ? rawStatus
          : "Queued";
      const column = tc.entityLink?.match(/::columns::([^>]+)>/)?.[1];
      return {
        name: tc.name,
        status,
        column,
      };
    });

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
      conn,
      `/api/v1/lineage/table/name/${encodeURIComponent(t.fullyQualifiedName)}`,
      { optional404: true }
    );

    const nodeById = new Map<string, { fqn: string; type: string }>();
    if (lineage?.entity?.id && lineage.entity.fullyQualifiedName) {
      nodeById.set(lineage.entity.id, { fqn: lineage.entity.fullyQualifiedName, type: lineage.entity.type });
    }
    for (const node of lineage?.nodes ?? []) {
      if (node.id && node.fullyQualifiedName) {
        nodeById.set(node.id, { fqn: node.fullyQualifiedName, type: node.type });
      }
    }

    for (const edge of lineage?.downstreamEdges ?? []) {
      const from = resolveLineageEntityFqn(edge.fromEntity, nodeById);
      const to = resolveLineageEntityFqn(edge.toEntity, nodeById);
      if (!from.fqn || !to.fqn) continue;
      if ((from.type && from.type !== "table") || (to.type && to.type !== "table")) continue;
      const key = `${from.fqn}->${to.fqn}`;
      if (lineageEdgeKeys.has(key)) continue;
      lineageEdgeKeys.add(key);
      allLineage.push({ fromTable: from.fqn, toTable: to.fqn });
    }
    for (const edge of lineage?.upstreamEdges ?? []) {
      const from = resolveLineageEntityFqn(edge.fromEntity, nodeById);
      const to = resolveLineageEntityFqn(edge.toEntity, nodeById);
      if (!from.fqn || !to.fqn) continue;
      if ((from.type && from.type !== "table") || (to.type && to.type !== "table")) continue;
      const key = `${from.fqn}->${to.fqn}`;
      if (lineageEdgeKeys.has(key)) continue;
      lineageEdgeKeys.add(key);
      allLineage.push({ fromTable: from.fqn, toTable: to.fqn });
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
