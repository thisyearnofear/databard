import { DitherAvatar, DitherButton, DitherGradient, PixelIcon } from "@/components/dither-kit";
import { findingSentence } from "@/lib/story";
import type { BriefingEpisodeMeta, SourceCard } from "./types";

interface BriefingHeroProps {
  episode: BriefingEpisodeMeta | null;
  cards: SourceCard[];
  avgHealth: number;
  isProtocols: boolean;
  onListenEpisode: () => void;
  onListenSource: (sourceEpisodeId: string) => void;
  onReadStory: () => void;
}

function priorityCard(cards: SourceCard[]): SourceCard | undefined {
  return [...cards].sort((left, right) => {
    const leftFailures = left.insight?.failingTests ?? 0;
    const rightFailures = right.insight?.failingTests ?? 0;
    return rightFailures - leftFailures || left.latestHealth - right.latestHealth;
  })[0];
}

/** L0 decision hero: one decision, one consequence, one primary action. */
export function BriefingHero({ episode, cards, avgHealth, isProtocols, onListenEpisode, onListenSource, onReadStory }: BriefingHeroProps) {
  const priority = priorityCard(cards);
  const priorityEpisodeId = priority?.insight?.episodeId ?? priority?.recentMints[0]?.episodeId;

  if (episode) {
    const headline = episode.testsFailed > 0
      ? `Your analyst found ${episode.testsFailed} ${episode.testsFailed === 1 ? "issue" : "issues"} — ${episode.schemaName}`
      : `Your analyst briefed ${episode.schemaName}`;
    const episodeInsight = cards.find((card) =>
      Boolean(episode.schemaFqn && episode.episodeId) &&
      card.insight?.schemaFqn === episode.schemaFqn &&
      card.insight?.episodeId === episode.episodeId
    )?.insight;
    const consequence = (episodeInsight ? findingSentence(episodeInsight) : null)
      ?? `${episode.tableCount} tables · ${episode.testsFailed}/${episode.testsTotal} tests failing · ${episode.segments} segments`;
    return (
      <section className="dither-grain relative bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-2xl p-5 mb-6 animate-slide-up overflow-hidden" aria-label="Priority briefing">
        {isProtocols && <DitherGradient from="purple" direction="left" cell={3} opacity={0.12} className="absolute inset-y-0 right-0 w-1/2 pointer-events-none" />}
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <DitherAvatar name={episode.schemaName} size={40} className="rounded-lg shrink-0" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">{isProtocols ? "Protocol signal" : "What your analyst found"}</p>
              <p className="text-sm font-semibold mt-0.5 mb-1">{headline}</p>
              <p className="text-xs text-[var(--text-muted)]">{consequence}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <DitherButton color="purple" variant="solid" bloom="low" onClick={onListenEpisode} className="px-5 py-2.5 text-sm font-semibold">
              <PixelIcon name="play" size={11} />
              Listen to the briefing
            </DitherButton>
            <button onClick={onReadStory} className="px-4 py-2.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
              Read the story ↓
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (priority?.insight && findingSentence(priority.insight)) {
    const finding = findingSentence(priority.insight)!;
    const nextAction = priority.insight.failingTests > 0
      ? "Review the failing tests and their downstream impact."
      : priority.insight.untestedCount > 0
        ? "Add coverage to the untested tables first."
        : "Review the latest health summary with your team.";
    return (
      <section className="relative mb-6 overflow-hidden border border-[var(--accent)]/35 bg-[var(--surface)] px-5 py-5 animate-slide-up" aria-labelledby="priority-title">
        <div className="absolute inset-y-0 left-0 w-1 bg-[var(--accent)]" aria-hidden />
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div className="min-w-0 max-w-2xl">
            <div className="flex items-center gap-2">
              <DitherAvatar name={priority.name} size={28} className="rounded-md shrink-0" />
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">{isProtocols ? "Protocol signal" : "What your analyst found"}</p>
            </div>
            <h2 id="priority-title" className="mt-3 text-xl font-bold">
              {priority.insight.failingTests > 0
                ? `${priority.insight.failingTests} failing ${priority.insight.failingTests === 1 ? "test" : "tests"} in ${priority.displayName}`
                : `${priority.displayName} needs stronger data coverage`}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{finding}</p>
          </div>
          <div className="min-w-[150px] border-l border-[var(--border)] pl-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Recommended action</p>
            <p className="mt-2 text-sm font-medium leading-snug">{nextAction}</p>
            <div className="mt-4 flex flex-col gap-2">
              {priorityEpisodeId && (
                <DitherButton color="purple" variant="solid" onClick={() => onListenSource(priorityEpisodeId)} className="px-3 py-2 text-xs font-semibold">
                  <PixelIcon name="play" size={10} />
                  Listen to the briefing
                </DitherButton>
              )}
              <button onClick={onReadStory} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer text-left">
                Read the story ↓
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const failing = cards.reduce((s, c) => s + (c.insight?.failingTests ?? 0), 0);
  const stale = cards.reduce((s, c) => s + (c.insight?.staleCount ?? 0), 0);
  const untested = cards.reduce((s, c) => s + (c.insight?.untestedCount ?? 0), 0);
  if (cards.length > 0 && failing === 0 && stale === 0 && untested === 0) {
    return (
      <section className="relative mb-6 border border-[var(--success)]/30 bg-[var(--success)]/5 rounded-2xl px-5 py-5 animate-slide-up" aria-label="Estate status">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--success)]">{isProtocols ? "Protocol signal" : "What your analyst found"}</p>
        <p className="mt-2 text-lg font-semibold">No material issues. Estate health {avgHealth}% across {cards.length} {cards.length === 1 ? "source" : "sources"}.</p>
        <button onClick={onReadStory} className="mt-3 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
          Review the story ↓
        </button>
      </section>
    );
  }

  return null;
}
