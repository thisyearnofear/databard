"use client";
import type { Want } from "@/lib/types";

const FOCUS_LABEL: Record<string, { label: string; tone: string }> = {
  overview:   { label: "Overview",   tone: "text-[var(--text)]" },
  quality:    { label: "Quality",    tone: "text-[var(--danger)]" },
  coverage:   { label: "Coverage",   tone: "text-yellow-400" },
  lineage:    { label: "Lineage",    tone: "text-blue-400" },
  governance: { label: "Governance", tone: "text-purple-400" },
  freshness:  { label: "Freshness",  tone: "text-cyan-400" },
};

export function WantCard({ want }: { want: Want }) {
  const focus = FOCUS_LABEL[want.focus] ?? FOCUS_LABEL.overview;
  const budgetSol = (want.budgetLamports / 1e9).toFixed(3);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <span>WANT posted</span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-muted)]">
              {want.buyer.label ?? want.buyer.kind}
            </span>
          </div>
          <div className="mt-1 font-mono text-sm text-[var(--text)]">{want.schemaFqn}</div>
        </div>
        <div className="text-right text-xs text-[var(--text-muted)]">
          <div>budget <span className="font-mono text-[var(--text)]">{budgetSol} SOL</span></div>
          <div>deadline <span className="font-mono text-[var(--text)]">{want.deadlineSec}s</span></div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">focus</span>
        <span className={`text-xs px-2 py-0.5 rounded-full bg-[var(--border)] ${focus.tone}`}>
          {focus.label}
        </span>
      </div>

      {want.evidenceHints && want.evidenceHints.length > 0 && (
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1">evidence hints</div>
          <div className="flex flex-wrap gap-1.5">
            {want.evidenceHints.map((h, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                <span className="font-mono text-[var(--text)]">{h.table}</span>
                <span className="text-[var(--text-muted)]"> — {h.reason}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
