/**
 * Historical schema snapshot store — persist SchemaInsights per schemaFqn
 * so the synthesis pipeline can generate "since last week" diff intros.
 */
import { store } from "./store";
import type { SchemaInsights } from "./schema-analysis";

export interface SchemaSnapshot {
  schemaFqn: string;
  schemaName: string;
  tableNames: string[];
  insights: SchemaInsights;
  recordedAt: string;
  episodeId?: string;
}

const SNAPSHOT_TTL = 86400 * 90; // 90 days

function key(schemaFqn: string): string {
  return `schema-snapshot:${schemaFqn}`;
}

function historyKey(schemaFqn: string): string {
  return `schema-history:${schemaFqn}`;
}

/** Record a new snapshot after episode generation */
export function saveSnapshot(snapshot: SchemaSnapshot): void {
  store.set(key(snapshot.schemaFqn), snapshot, SNAPSHOT_TTL);

  // Append to history for trend analysis
  const history = store.get<SchemaSnapshot[]>(historyKey(snapshot.schemaFqn)) ?? [];
  history.push(snapshot);
  if (history.length > 20) history.splice(0, history.length - 20);
  store.set(historyKey(snapshot.schemaFqn), history, SNAPSHOT_TTL);
}

/** Get the latest stored snapshot for a schema */
export function getLatestSnapshot(schemaFqn: string): SchemaSnapshot | null {
  return store.get<SchemaSnapshot>(key(schemaFqn));
}

/** Get full snapshot history for trend analysis */
export function getSnapshotHistory(schemaFqn: string): SchemaSnapshot[] {
  return store.get<SchemaSnapshot[]>(historyKey(schemaFqn)) ?? [];
}

/** List the latest snapshot of every schema — powers the analytics dashboard */
export function listSnapshots(): SchemaSnapshot[] {
  return store
    .keys("schema-snapshot:")
    .map((k) => store.get<SchemaSnapshot>(k))
    .filter((s): s is SchemaSnapshot => s !== null);
}
