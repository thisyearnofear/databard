/** Shared domain types — single source of truth */

export interface OMConnection {
  url: string;
  token: string;
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

export interface EpisodeAudio {
  intro: ArrayBuffer;
  segments: { audio: ArrayBuffer; segment: ScriptSegment }[];
  transitions: ArrayBuffer[];
  outro: ArrayBuffer;
}

export interface Episode {
  schemaFqn: string;
  schemaName: string;
  tableCount: number;
  qualitySummary: { passed: number; failed: number; total: number };
  script: ScriptSegment[];
  audioUrl?: string;
  duration?: number;
}
