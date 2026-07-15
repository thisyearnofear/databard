import { DitherAvatar } from "@/components/dither-kit";
import type { TrendNarrative } from "@/app/api/insights/trends/route";

function sourceName(schemaFqn: string): string {
  return schemaFqn.split(".")[0] || schemaFqn;
}

export function ChangeNarratives({ trends }: { trends: TrendNarrative[] }) {
  if (trends.length === 0) return null;
  return (
    <section className="mb-6" aria-labelledby="what-changed-title">
      <h2 id="what-changed-title" className="text-sm font-semibold mb-3 flex items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.2em] shimmer-text">▚▚</span>
        <span>What changed this week</span>
      </h2>
      <div className="flex flex-col gap-2">
        {trends.slice(0, 5).map((trend) => {
          const significant = Math.abs(trend.healthScoreChange) >= 5;
          const improvement = trend.healthScoreChange > 0;
          const decline = trend.healthScoreChange < 0;
          return (
            <div key={trend.schemaFqn} className={`rounded-xl p-4 border flex items-start gap-3 ${
              significant && decline ? "border-[var(--danger)]/30 bg-[var(--danger)]/5" : significant && improvement ? "border-[var(--success)]/30 bg-[var(--success)]/5" : "border-[var(--border)] bg-[var(--surface)]"
            }`}>
              <DitherAvatar name={sourceName(trend.schemaFqn)} size={28} className="rounded-md shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{trend.schemaName}</span>
                  {trend.healthScoreChange !== 0 && <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded-full ${improvement ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
                    {improvement ? "↑" : "↓"} {Math.abs(trend.healthScoreChange)}
                  </span>}
                  {!trend.hasHistory && <span className="font-mono text-xs text-[var(--text-muted)] bg-[var(--bg)] px-1.5 py-0.5 rounded-full">new</span>}
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{trend.narrative}</p>
              </div>
              <span className={`text-lg font-bold tabular-nums shrink-0 ${trend.healthScore >= 80 ? "text-[var(--success)]" : trend.healthScore >= 50 ? "text-[var(--warning)]" : "text-[var(--danger)]"}`}>{trend.healthScore}%</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
