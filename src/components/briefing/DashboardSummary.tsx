import { Sparkline as DitherSparkline } from "@/components/dither-kit";
import { healthTone } from "@/lib/briefing-health";
import { scoreColor } from "@/lib/product/score-tone";
import type { SourceCard } from "./types";

/** Point-wise mean of every card's history, aligned from the most recent point. */
function averageHealthSeries(cards: SourceCard[], points = 8): number[] {
  const tails = cards
    .map((c) => c.healthHistory)
    .filter((h) => h.length > 0)
    .map((h) => h.slice(-points));
  if (tails.length === 0) return [];
  const len = Math.max(...tails.map((t) => t.length));
  return Array.from({ length: len }, (_, i) => {
    let sum = 0;
    let n = 0;
    for (const tail of tails) {
      const value = tail[i - (len - tail.length)];
      if (value == null) continue;
      sum += value;
      n++;
    }
    return n > 0 ? Math.round(sum / n) : 0;
  });
}

export function DashboardSummary({ cards, avgHealth, totalFailing, totalMints, isProtocols }: {
  cards: SourceCard[];
  avgHealth: number;
  totalFailing: number;
  totalMints: number;
  isProtocols: boolean;
}) {
  return (
    <section
      className={`grid grid-cols-2 ${isProtocols ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3 mb-6`}
      aria-label="Briefing summary"
    >
      <div className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
        <div className="font-display text-2xl font-extrabold tabular-nums">{cards.length}</div>
        <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Sources tracked</div>
      </div>
      <div className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
        <div className="flex items-end justify-between gap-2">
          <div className="font-display text-2xl font-extrabold tabular-nums" style={{ color: scoreColor(avgHealth) }}>{avgHealth}%</div>
          <div className="w-16 h-7 mb-0.5"><DitherSparkline data={averageHealthSeries(cards)} color={healthTone(avgHealth)} bloom="aura" /></div>
        </div>
        <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Avg health</div>
      </div>
      <div className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
        <div className="font-display text-2xl font-extrabold tabular-nums" style={totalFailing > 0 ? { color: "var(--danger)" } : undefined}>{totalFailing}</div>
        <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Failing tests</div>
      </div>
      {isProtocols && <div className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
        <div className="font-display text-2xl font-extrabold tabular-nums">{totalMints}</div>
        <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">On-chain records</div>
      </div>}
    </section>
  );
}
