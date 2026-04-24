/** Shared domain types — single source of truth */

export type DataSource = "openmetadata" | "dbt-cloud" | "dbt-local" | "the-graph" | "dune";

export interface OMConnection {
  url: string;
  token: string;
}

export interface DbtConnection {
  accountId: string;
  projectId: string;
  token: string;
}

export interface TheGraphConnection {
  subgraphUrl: string;
  apiKey?: string;
}

export interface DuneConnection {
  apiKey: string;
  namespace?: string;
}

export interface ConnectionConfig {
  source: DataSource;
  openmetadata?: OMConnection;
  dbtCloud?: DbtConnection;
  dbtLocal?: { manifestPath?: string; manifestContent?: string };
  theGraph?: TheGraphConnection;
  dune?: DuneConnection;
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

export type ResearchFocus = "overview" | "quality" | "coverage" | "lineage" | "governance" | "freshness";

export interface ResearchCitation {
  source: string;
  reference: string;
  detail?: string;
}

export interface ResearchEvidence {
  id: string;
  label: string;
  detail: string;
  sourceType: "table" | "test" | "lineage" | "ownership" | "freshness" | "governance" | "coverage";
  table?: string;
  citations: ResearchCitation[];
}

export interface ResearchPlanStep {
  id: string;
  title: string;
  intent: string;
  evidenceIds: string[];
}

export interface ResearchTrail {
  question: string;
  focus: ResearchFocus;
  summary: string;
  plan: ResearchPlanStep[];
  evidence: ResearchEvidence[];
  recommendedActions: { title: string; priority: "critical" | "high" | "medium" | "low"; category: string; table?: string }[];
}

export interface ResearchSessionBranch {
  id: string;
  question: string;
  createdAt: string;
  parentBranchId?: string;
  researchTrail: ResearchTrail;
  episodeId?: string;
}

export interface ResearchSession {
  id: string;
  schemaFqn: string;
  schemaName: string;
  source: DataSource;
  createdAt: string;
  updatedAt: string;
  schemaMeta: SchemaMeta;
  branches: ResearchSessionBranch[];
  latestBranchId?: string;
  latestEpisodeId?: string;
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
  researchQuestion?: string;
  researchTrail?: ResearchTrail;
  researchSessionId?: string;
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
