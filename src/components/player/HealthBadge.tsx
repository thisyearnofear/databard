import type { Episode } from "@/lib/types";

export function HealthBadge({ summary }: { summary: Episode["qualitySummary"] }) {
  if (summary.total === 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--border)] text-[var(--text-muted)]">No tests</span>;
  if (summary.failed === 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--success)]/20 text-[var(--success)]">✓ Healthy</span>;
  const ratio = summary.failed / summary.total;
  if (ratio > 0.3) return <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--danger)]/20 text-[var(--danger)]">⚠ {summary.failed} failing</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">⚠ {summary.failed} failing</span>;
}
