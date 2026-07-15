import { Sparkline as DitherSparkline } from "@/components/dither-kit";
import { healthTone } from "@/lib/briefing-health";
import type { SourceCard } from "./types";

export function DashboardSummary({ cards, avgHealth, totalFailing, totalMints, isProtocols }: {
  cards: SourceCard[];
  avgHealth: number;
  totalFailing: number;
  totalMints: number;
  isProtocols: boolean;
}) {
  return (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" aria-label="Briefing summary">
      <div className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
        <div className="text-2xl font-extrabold tabular-nums">{cards.length}</div>
        <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Sources tracked</div>
      </div>
      <div className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
        <div className="flex items-end justify-between gap-2">
          <div className="text-2xl font-extrabold tabular-nums" style={{ color: `var(--${avgHealth >= 80 ? "success" : avgHealth >= 50 ? "warning" : "danger"})` }}>{avgHealth}%</div>
          <div className="w-16 h-7 mb-0.5"><DitherSparkline data={cards[0]?.healthHistory.slice(-8) ?? []} color={healthTone(avgHealth)} bloom="aura" /></div>
        </div>
        <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Avg health</div>
      </div>
      <div className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
        <div className="text-2xl font-extrabold tabular-nums" style={totalFailing > 0 ? { color: "var(--danger)" } : undefined}>{totalFailing}</div>
        <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Failing tests</div>
      </div>
      {isProtocols && <div className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
        <div className="text-2xl font-extrabold tabular-nums">{totalMints}</div>
        <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">On-chain records</div>
      </div>}
    </section>
  );
}
