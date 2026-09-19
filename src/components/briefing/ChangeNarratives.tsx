import { useRef } from "react";
import { DitherAvatar } from "@/components/dither-kit";
import { scoreTextClass } from "@/lib/product/score-tone";
import { consequenceSentence } from "@/lib/story";
import { track } from "@/lib/track";
import type { TrendNarrative } from "@/app/api/insights/trends/route";
import type { SourceCard } from "./types";

function sourceName(schemaFqn: string): string {
  return schemaFqn.split(".")[0] || schemaFqn;
}

function sourceSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "source";
}

export function ChangeNarratives({ trends, cards }: { trends: TrendNarrative[]; cards: SourceCard[] }) {
  // story_expand fires only the first time each narrative is expanded.
  const expandedRef = useRef<Set<string>>(new Set());
  if (trends.length === 0) return null;
  const visible = trends.slice(0, 5);
  const rest = trends.slice(5);
  const cardByName = new Map(cards.map((c) => [c.displayName, c]));
  const renderTrend = (trend: TrendNarrative) => {
    const significant = Math.abs(trend.healthScoreChange) >= 5;
    const improvement = trend.healthScoreChange > 0;
    const decline = trend.healthScoreChange < 0;
    const consequence = consequenceSentence(trend);
    const card = cardByName.get(trend.schemaName);
    const finding = card?.insight
      ? `${card.insight.failingTests} failing · ${card.insight.staleCount} stale · ${card.insight.untestedCount} untested`
      : null;
    return (
      <div key={trend.schemaFqn} className={`rounded-xl p-4 border flex items-start gap-3 ${
        significant && decline ? "border-[var(--danger)]/30 bg-[var(--danger)]/5" : significant && improvement ? "border-[var(--success)]/30 bg-[var(--success)]/5" : "border-[var(--border)] bg-[var(--surface)]"
      }`}>
        <DitherAvatar name={sourceName(trend.schemaFqn)} size={28} className="rounded-md shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium truncate">{trend.schemaName}</span>
            {trend.healthScoreChange !== 0 && <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded-full ${improvement ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
              {improvement ? "↑" : "↓"} {Math.abs(trend.healthScoreChange)}
            </span>}
            {!trend.hasHistory && <span className="font-mono text-xs text-[var(--text-muted)] bg-[var(--bg)] px-1.5 py-0.5 rounded-full">new</span>}
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">{trend.narrative}</p>
          {consequence && <p className="mt-1.5 text-xs leading-relaxed"><span className="font-medium">Why it matters: </span>{consequence}</p>}
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            {finding && <span className="font-mono text-[var(--text-muted)]">{finding}</span>}
            <a
              href={`#source-${sourceSlug(card?.name ?? trend.schemaName)}`}
              onClick={() => {
                if (expandedRef.current.has(trend.schemaFqn)) return;
                expandedRef.current.add(trend.schemaFqn);
                track("story_expand", { surface: "protocol", from: "trend" });
              }}
              className="text-[var(--accent)] no-underline hover:underline"
            >
              View evidence ↓
            </a>
          </div>
        </div>
        <span className={`font-display text-lg font-bold tabular-nums shrink-0 ${scoreTextClass(trend.healthScore)}`}>{trend.healthScore}%</span>
      </div>
    );
  };
  return (
    <div className="mb-6" aria-label="Weekly change narratives">
      <h2 id="what-changed-title" className="font-display text-sm font-semibold mb-1 flex items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.2em] shimmer-text">▚▚</span>
        <span>The story this week</span>
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-3">What changed, why it matters, and where the evidence lives.</p>
      <div className="flex flex-col gap-2">
        {visible.map(renderTrend)}
      </div>
      {rest.length > 0 && (
        <details className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <summary
            className="text-xs font-medium text-[var(--text-muted)] cursor-pointer list-none hover:text-[var(--text)]"
            onClick={() => track("story_expand", { surface: "protocol", from: "trend-overflow" })}
          >
            Show all {trends.length} changes
          </summary>
          <div className="mt-3 flex flex-col gap-2">{rest.map(renderTrend)}</div>
        </details>
      )}
    </div>
  );
}
