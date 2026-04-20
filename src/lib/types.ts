/** Shared domain types — single source of truth */

export type DataSource = "openmetadata" | "dbt-cloud" | "dbt-local";

export interface OMConnection {
  url: string;
  token: string;
}

export interface DbtConnection {
  accountId: string;
  projectId: string;
  token: string;
}

export interface ConnectionConfig {
  source: DataSource;
  openmetadata?: OMConnection;
  dbtCloud?: DbtConnection;
  dbtLocal?: { manifestPath?: string; manifestContent?: string };
}

export interface ColumnMeta {
  name: string;
  dataType: string;
  description?: string;
  tags: string[];
}

export interface QualityTest {
  name: string;
  status: "Success" | "Failed" | "Aborted" | "Queued";
  column?: string;
}

export interface LineageEdge {
  fromTable: string;
  toTable: string;
}

export interface TableMeta {
  fqn: string;
  name: string;
  description?: string;
  columns: ColumnMeta[];
  qualityTests: QualityTest[];
  tags: string[];
  /** OpenMetadata-enriched fields (optional — populated when source is OM) */
  owner?: string;
  rowCount?: number;
  freshness?: string;  // ISO timestamp of last update
  glossaryTerms?: string[];
  piiColumns?: string[];
}

export interface SchemaMeta {
  fqn: string;
  name: string;
  description?: string;
  tables: TableMeta[];
  lineage: LineageEdge[];
}

export type Speaker = "Alex" | "Morgan";

export interface ScriptSegment {
  speaker: Speaker;
  topic: string;
  text: string;
}

export interface Episode {
  schemaFqn: string;
  schemaName: string;
  tableCount: number;
  qualitySummary: { passed: number; failed: number; total: number };
  script: ScriptSegment[];
  /** Full schema metadata for interactive drill-down in the player */
  schemaMeta?: SchemaMeta;
  /** ISO timestamp of when this episode was generated */
  generatedAt?: string;
  audioUrl?: string;
  duration?: number;
}
