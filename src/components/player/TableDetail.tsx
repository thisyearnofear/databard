import type { TableMeta, LineageEdge } from "@/lib/types";

export function TableDetail({ table, lineage }: { table: TableMeta; lineage: LineageEdge[] }) {
  const upstream = lineage.filter((e) => e.toTable.endsWith(`.${table.name}`)).map((e) => e.fromTable.split(".").pop());
  const downstream = lineage.filter((e) => e.fromTable.endsWith(`.${table.name}`)).map((e) => e.toTable.split(".").pop());
  const failed = table.qualityTests.filter((t) => t.status === "Failed");
  const passed = table.qualityTests.filter((t) => t.status === "Success");

  return (
    <div className="mt-2 p-3 bg-[var(--bg)] rounded-lg text-xs space-y-2 animate-slide-up">
      {/* Header: owner + row count + freshness */}
      <div className="flex flex-wrap gap-3 text-[var(--text-muted)]">
        {table.owner && <span>👤 {table.owner}</span>}
        {table.rowCount != null && <span>📊 {table.rowCount > 1_000_000 ? `${(table.rowCount / 1_000_000).toFixed(1)}M` : table.rowCount > 1000 ? `${(table.rowCount / 1000).toFixed(0)}K` : table.rowCount} rows</span>}
        {table.freshness && <span>🕐 {new Date(table.freshness).toLocaleDateString()}</span>}
      </div>

      {table.description && (
        <p className="text-[var(--text-muted)] italic">{table.description}</p>
      )}

      {/* PII warning */}
      {table.piiColumns && table.piiColumns.length > 0 && (
        <div className="px-2 py-1 rounded bg-[var(--danger)]/10 text-[var(--danger)]">
          🔒 Sensitive data: {table.piiColumns.join(", ")}
        </div>
      )}

      {/* Glossary terms */}
      {table.glossaryTerms && table.glossaryTerms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {table.glossaryTerms.map((term) => (
            <span key={term} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">📖 {term}</span>
          ))}
        </div>
      )}

      {/* Columns */}
      <div>
        <span className="text-[var(--text-muted)]">Columns ({table.columns.length}): </span>
        <span className="text-[var(--text)]">
          {table.columns.slice(0, 6).map((c) => `${c.name} (${c.dataType})`).join(", ")}
          {table.columns.length > 6 && ` +${table.columns.length - 6} more`}
        </span>
      </div>

      {/* Tests */}
      {table.qualityTests.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {failed.map((t) => (
            <span key={t.name} className="px-1.5 py-0.5 rounded bg-[var(--danger)]/20 text-[var(--danger)]">✗ {t.name}</span>
          ))}
          {passed.map((t) => (
            <span key={t.name} className="px-1.5 py-0.5 rounded bg-[var(--success)]/20 text-[var(--success)]">✓ {t.name}</span>
          ))}
        </div>
      )}
      {table.qualityTests.length === 0 && (
        <p className="text-[var(--text-muted)]">No quality tests configured</p>
      )}

      {/* Lineage */}
      {(upstream.length > 0 || downstream.length > 0) && (
        <div className="flex gap-4">
          {upstream.length > 0 && <span className="text-[var(--text-muted)]">Depends on: {upstream.join(", ")}</span>}
          {downstream.length > 0 && <span className="text-[var(--text-muted)]">Feeds into: {downstream.join(", ")}</span>}
        </div>
      )}

      {/* Tags */}
      {table.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {table.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}
