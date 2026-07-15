"use client";

import { getDataAwarePresets } from "../coral-helpers";

interface CoralPreviewData {
  columns: Array<{ name: string; dataType: string; nullCount: number; sampleValues: unknown[] }>;
  rows: Record<string, unknown>[];
  rowCount: number;
  sources: string[];
  message?: string;
}

interface CoralConfigureStepProps {
  preview: CoralPreviewData;
  query: string;
  outputFormat: "podcast" | "anthem" | "executive-summary";
  researchQuestion: string;
  connecting: boolean;
  onFormatChange: (format: "podcast" | "anthem" | "executive-summary") => void;
  onQuestionChange: (question: string) => void;
  onGenerate: () => void;
  onBack: () => void;
}

export function CoralConfigureStep({
  preview,
  query,
  outputFormat,
  researchQuestion,
  connecting,
  onFormatChange,
  onQuestionChange,
  onGenerate,
  onBack,
}: CoralConfigureStepProps) {
  const { columns, rows, rowCount, sources } = preview;
  const presets = getDataAwarePresets(query, columns, sources);

  return (
    <div className="flex flex-col gap-4">
      {/* Data summary */}
      <div className="bg-[var(--accent)]/5 border border-[var(--accent)]/10 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">
                {rowCount} row{rowCount !== 1 ? "s" : ""} from {sources.join(", ") || "Coral"}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {columns.length} column{columns.length !== 1 ? "s" : ""}: {columns.map((c) => c.name).join(", ")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer border border-[var(--border)] rounded-lg px-2.5 py-2.5 hover:border-[var(--accent)] transition-colors"
          >
            ← Edit query
          </button>
        </div>
      </div>

      {/* Collapsible data preview */}
      <details className="group">
        <summary className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform text-xs">▶</span>
          Preview data
        </summary>
        <div className="border border-[var(--border)] rounded-xl overflow-hidden mt-2">
          {/* Column badges */}
          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg)]">
            {columns.map((col) => (
              <span key={col.name} className="text-xs px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                <span className="font-medium text-[var(--text)]">{col.name}</span>
                <span className="text-[var(--text-muted)] ml-1">{col.dataType}</span>
              </span>
            ))}
          </div>
          {/* Rows */}
          <div className="overflow-x-auto max-h-32">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {columns.map((col) => (
                    <th key={col.name} className="text-left px-2.5 py-1.5 font-medium text-[var(--text-muted)] whitespace-nowrap">{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]">
                    {columns.map((col) => {
                      const val = row[col.name];
                      const display = val === null ? "—" : typeof val === "object" ? JSON.stringify(val) : String(val).slice(0, 60);
                      return <td key={col.name} className="px-2.5 py-1.5 text-[var(--text-muted)] max-w-32 truncate" title={String(val ?? "")}>{display}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rowCount > 5 && (
            <div className="px-3 py-1.5 text-xs text-[var(--text-muted)] bg-[var(--bg)] border-t border-[var(--border)]">
              + {rowCount - 5} more rows
            </div>
          )}
        </div>
      </details>

      {/* Format picker */}
      <div>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium block mb-2">Output format</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onFormatChange("podcast")}
            className={`flex flex-col items-center justify-center rounded-xl border-2 px-3 py-3 cursor-pointer transition ${
              outputFormat === "podcast"
                ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
          >
            <span className="text-lg mb-1">🎙️</span>
            <span className="text-sm font-semibold text-[var(--text)]">Full analysis</span>
            <span className="text-xs text-[var(--text-muted)] mt-0.5">Two AI hosts, 10-15 min</span>
          </button>
          <button
            type="button"
            onClick={() => onFormatChange("executive-summary")}
            className={`flex flex-col items-center justify-center rounded-xl border-2 px-3 py-3 cursor-pointer transition ${
              outputFormat === "executive-summary"
                ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
          >
            <span className="text-lg mb-1">📋</span>
            <span className="text-sm font-semibold text-[var(--text)]">Executive briefing</span>
            <span className="text-xs text-[var(--text-muted)] mt-0.5">2-min, top 3 issues + actions</span>
          </button>
        </div>
      </div>

      {/* Research question */}
      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-medium">Your question</label>
        <textarea
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm min-h-16 resize-y focus:border-[var(--accent)] focus:outline-none transition-colors"
          value={researchQuestion}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder="What do you want to know about this data?"
        />
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onQuestionChange(preset)}
              className={`text-xs px-2 py-2.5 rounded-full border transition-colors cursor-pointer ${
                researchQuestion === preset
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]"
                  : "border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--text)] text-[var(--text-muted)]"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={onGenerate}
        disabled={connecting}
        className="w-full bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-3.5 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition ease-out hover:scale-[1.01] shadow-md shadow-[var(--accent)]/10"
      >
        {connecting && <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--bg)]/30 border-t-[var(--bg)] rounded-full animate-spin" />}
        {connecting
          ? "Generating…"
          : outputFormat === "anthem"
            ? "Compose Anthem 🎵"
            : "Generate Episode 🎙️"}
      </button>
    </div>
  );
}
