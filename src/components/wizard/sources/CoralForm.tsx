"use client";

import { useState } from "react";
import { useWizard } from "../wizard-context";
import { validateCoralSql, extractCoralSources, parseCoralError, getPresetsForPersona, getDataAwarePresets } from "../coral-helpers";

interface CoralFormProps {
  query: string;
  onQueryChange: (q: string) => void;
}

export function CoralForm({ query, onQueryChange }: CoralFormProps) {
  const { state } = useWizard();
  const presets = getPresetsForPersona(state.persona);
  const [previewOpen, setPreviewOpen] = useState(false);
  const validation = validateCoralSql(query);
  const querySources = extractCoralSources(query);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{
    columns: Array<{ name: string; dataType: string; nullCount: number; sampleValues: unknown[] }>;
    rows: Record<string, unknown>[];
    rowCount: number;
    sources: string[];
    message?: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function handlePreview() {
    if (!query.trim()) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreviewData(null);
    try {
      const res = await fetch("/api/coral/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.ok) {
        setPreviewData(data);
        setPreviewOpen(true);
      } else {
        setPreviewError(data.error || "Preview failed");
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  const detectedSources = previewData?.sources ?? [];

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3 bg-[var(--accent)]/5 border border-[var(--accent)]/10 rounded-xl px-4 py-3">
        <span className="text-lg mt-0.5">🪸</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text)]">Query Any Source</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
            Coral joins data across 50+ sources via SQL — GitHub, Slack, Jira, Notion, Stripe, and more.
            Pick a template to see real data, then edit the query for your needs.
          </p>
        </div>
      </div>

      {/* Preset queries */}
      <div>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium block mb-2">
          Try a template
        </label>
        <div className="flex flex-col gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onQueryChange(preset.query);
                setPreviewData(null);
                setPreviewOpen(false);
                // Auto-preview after setting query
                setTimeout(() => {
                  setPreviewing(true);
                  setPreviewError(null);
                  fetch("/api/coral/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: preset.query }),
                  })
                    .then((r) => r.json())
                    .then((data) => {
                      if (data.ok) { setPreviewData(data); setPreviewOpen(true); }
                      else { setPreviewError(data.error || "Preview failed"); }
                    })
                    .catch((e) => setPreviewError(e instanceof Error ? e.message : "Preview failed"))
                    .finally(() => setPreviewing(false));
                }, 100);
              }}
              className={`text-left border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                query === preset.query
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--text)]">{preset.label}</span>
                <span className="text-xs text-[var(--text-muted)]">{preset.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* SQL editor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
            SQL Query
          </label>
          {querySources.length > 0 && (
            <div className="flex items-center gap-1.5">
              {querySources.map((s) => (
                <span key={s} className="text-xs bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full font-medium">{s}</span>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <pre
            className="absolute inset-0 w-full h-full overflow-hidden bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm font-mono whitespace-pre-wrap break-all leading-relaxed pointer-events-none"
            aria-hidden="true"
          >
            {(query || " ").split(/(\b(?:SELECT|FROM|JOIN|WHERE|ON|AND|OR|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|AS|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|INTERVAL|DESC|ASC|IN|NOT|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|CASE|WHEN|THEN|ELSE|END|NOW)\b)/gi).map((part, i) =>
              /^(?:SELECT|FROM|JOIN|WHERE|ON|AND|OR|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|AS|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|INTERVAL|DESC|ASC|IN|NOT|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|CASE|WHEN|THEN|ELSE|END|NOW)$/i.test(part)
                ? <span key={i} className="text-[var(--accent)] font-semibold">{part}</span>
                : <span key={i} className="text-[var(--text)]">{part}</span>
            )}
          </pre>
          <textarea
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setPreviewData(null);
              setPreviewOpen(false);
            }}
            placeholder="SELECT * FROM github.issues JOIN slack.messages ON..."
            spellCheck={false}
            className={`relative w-full bg-transparent border rounded-lg px-4 py-3 text-sm font-mono text-transparent caret-[var(--accent)] resize-y min-h-32 focus:outline-none transition-colors ${
              !validation.valid && query.trim()
                ? "border-yellow-500/50 focus:border-yellow-500"
                : "border-[var(--border)] focus:border-[var(--accent)]"
            }`}
          />
        </div>
        {!validation.valid && query.trim() && validation.hint && (
          <p className="text-xs text-yellow-500 flex items-center gap-1 mt-1.5">
            <span>⚠️</span>
            <span>{validation.hint}</span>
          </p>
        )}
      </div>

      {/* Source badges + preview */}
      {detectedSources.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Sources:</span>
          {detectedSources.map((s) => (
            <span
              key={s}
              className="text-xs bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full font-medium"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!query.trim() || previewing || !validation.valid}
          className="flex-1 bg-[var(--surface)] hover:bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {previewing && <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--text-muted)]/30 border-t-[var(--text-muted)] rounded-full animate-spin" />}
          {previewing ? "Previewing…" : "Preview Results"}
        </button>
      </div>

      {/* Preview panel */}
      {previewing && !previewData && (
        <div className="border border-[var(--border)] rounded-xl overflow-hidden animate-pulse">
          <div className="bg-[var(--surface)] px-4 py-2 border-b border-[var(--border)] flex items-center gap-2">
            <div className="h-3 w-16 bg-[var(--border)] rounded" />
            <div className="h-3 w-24 bg-[var(--border)] rounded" />
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className="flex gap-1.5">
              <div className="h-5 w-20 bg-[var(--border)] rounded" />
              <div className="h-5 w-16 bg-[var(--border)] rounded" />
              <div className="h-5 w-24 bg-[var(--border)] rounded" />
            </div>
            <div className="h-4 w-full bg-[var(--border)] rounded" />
            <div className="h-4 w-3/4 bg-[var(--border)] rounded" />
            <div className="h-4 w-5/6 bg-[var(--border)] rounded" />
          </div>
        </div>
      )}

      {previewError && (() => {
        const parsed = parseCoralError(previewError);
        return (
          <div className="bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-3 text-xs">
            <p className="text-red-400 font-medium">{parsed.message}</p>
            {parsed.hint && <p className="text-red-400/70 mt-1">{parsed.hint}</p>}
            {parsed.action && (
              <code className="block mt-1.5 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-muted)] select-all">
                {parsed.action}
              </code>
            )}
          </div>
        );
      })()}

      {previewOpen && previewData && (
        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between bg-[var(--surface)] px-4 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text)]">Results</span>
              <span className="text-xs text-[var(--text-muted)]">
                {previewData.rowCount} row{previewData.rowCount !== 1 ? "s" : ""} · {previewData.columns.length} columns
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          {previewData.rowCount === 0 && previewData.columns.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-[var(--text-muted)] mb-2">No results for this query</p>
              <p className="text-xs text-[var(--text-muted)] opacity-70">
                Try changing the <code className="bg-[var(--bg)] px-1 rounded">owner</code> and <code className="bg-[var(--bg)] px-1 rounded">repo</code> to your own,
                or pick a different template above.
              </p>
            </div>
          ) : (
            <>
              {/* Column list */}
              <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
                {previewData.columns.map((col) => (
                  <span
                    key={col.name}
                    className="text-xs px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)]"
                  >
                    <span className="font-medium text-[var(--text)]">{col.name}</span>
                    <span className="text-[var(--text-muted)] ml-1">{col.dataType}</span>
                    {col.nullCount > 0 && (
                      <span className="text-[var(--text-muted)] ml-1 opacity-60">({col.nullCount} null)</span>
                    )}
                  </span>
                ))}
              </div>

              {/* Sample rows */}
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      {previewData.columns.map((col) => (
                        <th key={col.name} className="text-left px-3 py-2 font-medium text-[var(--text-muted)] whitespace-nowrap">
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, i) => (
                      <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]">
                        {previewData.columns.map((col) => {
                          const val = row[col.name];
                          const display = val === null ? "null" : typeof val === "object" ? JSON.stringify(val) : String(val);
                          return (
                            <td key={col.name} className="px-3 py-2 text-[var(--text-muted)] max-w-48 truncate" title={display}>
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {previewData.message && (
            <div className="px-4 py-2 text-xs text-[var(--text-muted)] italic bg-[var(--bg)]">
              {previewData.message}
            </div>
          )}
        </div>
      )}
    </>
  );
}
