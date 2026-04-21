/**
 * The Graph adapter — fetches subgraph schema metadata and normalizes to SchemaMeta.
 * Supports The Graph hosted service and decentralized network subgraphs.
 * Treats GraphQL entity types as "tables" and fields as "columns".
 */
import type { SchemaMeta, TableMeta, ColumnMeta, QualityTest } from "./types";

export interface TheGraphConfig {
  /** Subgraph endpoint URL, e.g. https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3 */
  subgraphUrl: string;
  /** Optional API key for The Graph Network */
  apiKey?: string;
}

interface GraphQLField {
  name: string;
  type: { name: string | null; kind: string; ofType?: { name: string | null; kind: string } };
  description?: string | null;
}

interface GraphQLType {
  name: string;
  kind: string;
  description?: string | null;
  fields?: GraphQLField[] | null;
}

interface IntrospectionResult {
  data: {
    __schema: {
      types: GraphQLType[];
    };
  };
}

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      types {
        name
        kind
        description
        fields {
          name
          description
          type {
            name
            kind
            ofType { name kind }
          }
        }
      }
    }
  }
`;

/** Resolve a GraphQL type to a readable string */
function resolveTypeName(type: GraphQLField["type"]): string {
  if (type.name) return type.name;
  if (type.ofType?.name) return type.ofType.name;
  return type.kind ?? "unknown";
}

/** Fetch subgraph schema via GraphQL introspection */
export async function fetchTheGraphMeta(config: TheGraphConfig, subgraphId?: string): Promise<SchemaMeta> {
  const url = config.subgraphUrl;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  });

  if (!res.ok) throw new Error(`The Graph API error: ${res.status} ${res.statusText}`);
  const json: IntrospectionResult = await res.json();

  if (!json.data?.__schema) throw new Error("Invalid introspection response from subgraph");

  const allTypes = json.data.__schema.types;

  // Filter to entity types (OBJECT kind, not internal GraphQL types)
  const entityTypes = allTypes.filter(
    (t) =>
      t.kind === "OBJECT" &&
      !t.name.startsWith("__") &&
      t.name !== "Query" &&
      t.name !== "Subscription" &&
      t.fields != null
  );

  // Derive subgraph name from URL
  const urlParts = url.split("/");
  const subgraphName = subgraphId ?? urlParts[urlParts.length - 1] ?? "subgraph";
  const fqn = `the-graph.${subgraphName}`;

  const tables: TableMeta[] = entityTypes.map((entity) => {
    const columns: ColumnMeta[] = (entity.fields ?? []).map((field) => ({
      name: field.name,
      dataType: resolveTypeName(field.type),
      description: field.description ?? undefined,
      tags: [],
    }));

    // Heuristic quality checks: flag entities with no ID field or no fields
    const qualityTests: QualityTest[] = [];
    const hasId = columns.some((c) => c.name === "id");
    if (!hasId) {
      qualityTests.push({ name: "entity_has_id", status: "Failed", column: "id" });
    }
    if (columns.length === 0) {
      qualityTests.push({ name: "entity_has_fields", status: "Failed" });
    }

    return {
      fqn: `${fqn}.${entity.name}`,
      name: entity.name,
      description: entity.description ?? undefined,
      columns,
      qualityTests,
      tags: ["the-graph", "subgraph"],
    };
  });

  // Build lineage from field references between entity types
  const entityNames = new Set(entityTypes.map((e) => e.name));
  const lineage: { fromTable: string; toTable: string }[] = [];
  const seen = new Set<string>();

  for (const entity of entityTypes) {
    for (const field of entity.fields ?? []) {
      const refType = resolveTypeName(field.type);
      if (entityNames.has(refType) && refType !== entity.name) {
        const key = `${entity.name}->${refType}`;
        if (!seen.has(key)) {
          seen.add(key);
          lineage.push({ fromTable: `${fqn}.${entity.name}`, toTable: `${fqn}.${refType}` });
        }
      }
    }
  }

  return {
    fqn,
    name: subgraphName,
    description: `The Graph subgraph: ${url}`,
    tables,
    lineage,
  };
}

/** List available subgraphs — returns the single configured subgraph as a schema FQN */
export function listTheGraphSchemas(config: TheGraphConfig): string[] {
  const urlParts = config.subgraphUrl.split("/");
  const subgraphName = urlParts[urlParts.length - 1] ?? "subgraph";
  return [`the-graph.${subgraphName}`];
}
