"use client";

/**
 * Shared data-viz primitives — single source of truth for health bars,
 * trend indicators, and history sparklines. Used by /leaderboard,
 * /protocol (health analytics dashboard), and /history.
 */

export function healthColor(score: number): string {
  return score >= 80 ? "var(--success)" : score >= 50 ? "#f5c842" : "var(--danger)";
}

/** Horizontal 0–100 score bar with % label. Fills its container when width is omitted. */
export function HealthBar({ score, width }: { score: number; width?: number }) {
  const color = healthColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, ...(width ? {} : { flex: 1 }) }}>
      <div style={{ ...(width ? { width } : { flex: 1 }), height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: 14, minWidth: 36 }}>{score}%</span>
    </div>
  );
}

/** ↑/↓/→ trend arrow, optionally with a text label. */
export function TrendBadge({ trend, showLabel = false }: { trend: "up" | "down" | "stable"; showLabel?: boolean }) {
  const [color, arrow, label] =
    trend === "up"
      ? ["var(--success)", "↑", "Improving"]
      : trend === "down"
        ? ["var(--danger)", "↓", "Declining"]
        : ["var(--text-muted)", "→", "Stable"];
  return (
    <span style={{ color, fontSize: 16 }}>
      {arrow}
      {showLabel ? ` ${label}` : ""}
    </span>
  );
}

/**
 * Inline SVG sparkline for a chronological series of 0–100 health scores.
 * Fixed 0–100 y-scale so shapes are comparable across cards.
 */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const y = (v: number) => pad + (1 - v / 100) * (height - pad * 2);
  const points = values.map((v, i) => `${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = healthColor(values[values.length - 1]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Health score history" role="img">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pad + (values.length - 1) * step} cy={y(values[values.length - 1])} r="2" fill={color} />
    </svg>
  );
}

/** Compact stat tile for dashboard summary rows. */
export function StatTile({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-3 flex-1 min-w-[140px] text-center">
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

/** Labeled thin progress bar for coverage percentages. */
export function CoverageBar({ label, value, color = "var(--accent)" }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

/** Small numeric stat cell for insight grids. */
export function MiniStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-[var(--bg)] rounded-lg p-2 text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

export interface CriticalTableRow {
  name: string;
  failingTests: number;
  downstreamCount: number;
  risk: string;
}

/** Risk-dotted list of critical tables (failing tests × downstream dependents). */
export function CriticalTablesList({ tables }: { tables: CriticalTableRow[] }) {
  if (tables.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">Critical Tables</h4>
      <div className="space-y-1.5">
        {tables.map((ct) => (
          <div key={ct.name} className="flex items-center gap-2 text-xs bg-[var(--bg)] rounded-lg px-3 py-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              ct.risk === "critical" ? "bg-[var(--danger)]" : ct.risk === "high" ? "bg-yellow-400" : "bg-[var(--border)]"
            }`} />
            <span className="font-medium truncate">{ct.name}</span>
            <span className="text-[var(--text-muted)] ml-auto shrink-0">
              {ct.failingTests > 0 && `${ct.failingTests} failing`}
              {ct.failingTests > 0 && ct.downstreamCount > 0 && " · "}
              {ct.downstreamCount > 0 && `${ct.downstreamCount} dependents`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chip row of lineage hotspots (most-connected tables). */
export function HotspotChips({ hotspots, title = "High-traffic tables" }: { hotspots: { name: string; connections: number }[]; title?: string }) {
  if (hotspots.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {hotspots.map((h) => (
          <span key={h.name} className="text-xs px-2 py-1 rounded bg-[var(--bg)] text-[var(--text-muted)]">
            {h.name} <span className="text-[var(--accent)]">({h.connections})</span>
          </span>
        ))}
      </div>
    </div>
  );
}
