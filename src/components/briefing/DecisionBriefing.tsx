import { DitherAvatar, DitherButton } from "@/components/dither-kit";
import { costLine } from "@/lib/cost-framing";
import type { SourceCard } from "./types";

interface DecisionBriefingProps {
  cards: SourceCard[];
  isProtocols: boolean;
  onListen: (episodeId: string) => void;
}

/** The dashboard's decision layer: what needs attention, why, and the next move. */
export function DecisionBriefing({ cards, isProtocols, onListen }: DecisionBriefingProps) {
  const priority = [...cards].sort((left, right) => {
    const leftFailures = left.insight?.failingTests ?? 0;
    const rightFailures = right.insight?.failingTests ?? 0;
    return rightFailures - leftFailures || left.latestHealth - right.latestHealth;
  })[0];

  if (!priority?.insight) return null;

  const { insight } = priority;
  const hasPriority = insight.failingTests > 0 || insight.staleCount > 0 || insight.untestedCount > 0;
  if (!hasPriority) return null;
  const downstreamAtRisk = insight.criticalTables.reduce((total, table) => total + table.downstreamCount, 0);
  const impact = costLine({
    failingTests: insight.failingTests,
    downstreamAtRisk,
    staleTables: insight.staleCount,
    undocumentedTables: insight.undocumentedCount,
    untestedTables: insight.untestedCount,
  });
  const episodeId = insight.episodeId ?? priority.recentMints[0]?.episodeId;
  const nextAction = insight.failingTests > 0
    ? "Review the failing tests and their downstream impact."
    : insight.untestedCount > 0
      ? "Add coverage to the untested tables first."
      : "Review the latest health summary with your team.";

  return (
    <section className="relative mb-6 overflow-hidden border border-[var(--accent)]/35 bg-[var(--surface)] px-5 py-5 animate-slide-up" aria-labelledby="priority-title">
      <div className="absolute inset-y-0 left-0 w-1 bg-[var(--accent)]" aria-hidden />
      <div className="flex items-start justify-between gap-5 flex-wrap">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-2">
            <DitherAvatar name={priority.name} size={28} className="rounded-md shrink-0" />
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">{isProtocols ? "Protocol signal" : "What needs attention"}</p>
          </div>
          <h2 id="priority-title" className="mt-3 text-xl font-bold">
            {insight.failingTests > 0
              ? `${insight.failingTests} failing test${insight.failingTests === 1 ? "" : "s"} in ${priority.displayName}`
              : `${priority.displayName} needs stronger data coverage`}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{impact ?? nextAction}</p>
        </div>
        <div className="min-w-[150px] border-l border-[var(--border)] pl-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{isProtocols ? "Next action" : "Recommended next step"}</p>
          <p className="mt-2 text-sm font-medium leading-snug">{nextAction}</p>
          {episodeId && (
            <DitherButton color="purple" variant="gradient" onClick={() => onListen(episodeId)} className="mt-4 px-3 py-2 text-xs font-semibold">
              {isProtocols ? "Listen to the briefing" : "Listen to the analysis"}
            </DitherButton>
          )}
        </div>
      </div>
    </section>
  );
}
