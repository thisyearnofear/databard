"use client";

import { scoreTextClass } from "@/lib/product/score-tone";
import type { ScoreCard } from "@/lib/score-card";

export function ScoreCardView({
  card,
  onPlayClip,
  clipPlaying = false,
}: {
  card: ScoreCard;
  onPlayClip?: () => void;
  clipPlaying?: boolean;
}) {
  return (
    <article
      className="w-full max-w-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-7 sm:px-8 sm:py-8"
      aria-label={`${card.name} health ${card.score}`}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
        Shared finding
      </p>
      <div className="mt-5 flex items-end gap-4">
        <p className={`font-display text-[72px] sm:text-[88px] font-bold leading-none tabular-nums tracking-tight ${scoreTextClass(card.score)}`}>
          {card.score}
        </p>
        <div className="pb-2 min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Health</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{card.name}</h1>
          {card.failed > 0 && (
            <p className="mt-1 text-xs text-[var(--danger)]">{card.failed} failing</p>
          )}
        </div>
      </div>
      <blockquote className="mt-6 text-base sm:text-lg leading-relaxed text-[var(--text)]">
        “{card.quote}”
      </blockquote>
      <p className="mt-2 text-xs text-[var(--text-muted)]">— {card.speaker}</p>
      {onPlayClip && (
        <button
          type="button"
          onClick={onPlayClip}
          className="mt-6 bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--bg)] hover:brightness-110"
        >
          {clipPlaying ? "Playing…" : "Hear this finding"}
        </button>
      )}
    </article>
  );
}
