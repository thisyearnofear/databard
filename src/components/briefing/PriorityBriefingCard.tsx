import Link from "next/link";
import { DitherAvatar, DitherButton, DitherGradient } from "@/components/dither-kit";
import type { BriefingEpisodeMeta } from "./types";

interface PriorityBriefingCardProps {
  episodeId: string;
  episode: BriefingEpisodeMeta;
  isProtocols: boolean;
  onListen: () => void;
  onSchedule: () => void;
}

/** The dashboard's first-action card: a decision-ready briefing with audio. */
export function PriorityBriefingCard({ episodeId, episode, isProtocols, onListen, onSchedule }: PriorityBriefingCardProps) {
  return (
    <section className="relative bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-2xl p-5 mb-6 animate-slide-up overflow-hidden" aria-label="Priority briefing">
      {isProtocols && <DitherGradient from="purple" direction="left" cell={3} opacity={0.12} className="absolute inset-y-0 right-0 w-1/2 pointer-events-none" />}
      <div className="relative flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <DitherAvatar name={episode.schemaName} size={40} className="rounded-lg shrink-0" />
          <div>
            <p className="text-sm font-semibold mb-1">Your analyst found {episode.testsFailed > 0 ? `${episode.testsFailed} issue${episode.testsFailed !== 1 ? "s" : ""}` : "a briefing"} — {episode.schemaName}</p>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              {episode.tableCount} tables · {episode.testsFailed}/{episode.testsTotal} tests failing · {episode.segments} segments
            </p>
          </div>
        </div>
        <DitherButton color="purple" variant="gradient" bloom="low" onClick={onListen} className="px-5 py-2.5 text-sm font-semibold shrink-0">
          ▶ Listen to the briefing
        </DitherButton>
      </div>
      <div className="relative mt-4 pt-4 border-t border-[var(--accent)]/20 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-[var(--text-muted)]">{isProtocols ? "Want a fresh, attestable protocol briefing each week?" : "Want this every Monday? Your analyst can run automatically."}</p>
        <Link
          href={`/pro?setup=1&schema=${encodeURIComponent(episode.schemaName)}&episode=${episodeId}`}
          onClick={onSchedule}
          className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1"
        >
          {isProtocols ? "Set up weekly briefing →" : "Set up weekly digest →"}
        </Link>
      </div>
    </section>
  );
}
