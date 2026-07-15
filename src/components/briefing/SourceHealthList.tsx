import Link from "next/link";
import { costLine } from "@/lib/cost-framing";
import { healthTone } from "@/lib/briefing-health";
import { BadgePanel } from "@/components/BadgePanel";
import { HealthBar, TrendBadge, CoverageBar, MiniStat, CriticalTablesList, HotspotChips } from "@/components/viz";
import { Sparkline as DitherSparkline, DitherAvatar, DitherButton } from "@/components/dither-kit";
import type { SourceCard } from "./types";

function sourceLabel(card: SourceCard) {
  if (card.source === "the-graph") return "The Graph subgraph";
  if (card.source === "dune") return "Dune Analytics";
  return card.mintCount > 0 ? "Onchain" : "Warehouse / catalog";
}

interface SourceHealthListProps {
  cards: SourceCard[];
  isProtocols: boolean;
  hoveredCard: string | null;
  onHoverChange: (name: string | null) => void;
  onListen: (episodeId: string) => void;
}

/** Progressive evidence layer: source health sits below the weekly narrative. */
export function SourceHealthList({ cards, isProtocols, hoveredCard, onHoverChange, onListen }: SourceHealthListProps) {
  return (
    <section className="flex flex-col gap-4" aria-label="Source health evidence">
      {cards.map((card) => {
        const episodeId = card.insight?.episodeId ?? card.recentMints[0]?.episodeId;
        const cost = card.insight ? costLine({
          failingTests: card.insight.failingTests,
          downstreamAtRisk: card.insight.criticalTables.reduce((sum, table) => sum + table.downstreamCount, 0),
          staleTables: card.insight.staleCount,
          undocumentedTables: card.insight.undocumentedCount,
          untestedTables: card.insight.untestedCount,
        }) : null;

        return (
          <article
            key={card.name}
            onMouseEnter={() => onHoverChange(card.name)}
            onMouseLeave={() => onHoverChange(null)}
            className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--accent)]/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                  <DitherAvatar name={card.name} size={36} className="rounded-lg shrink-0" bloom="low" />
                  <h3 className="text-lg font-bold">{card.displayName}</h3>
                  <span className="font-mono text-xs text-[var(--text-muted)] bg-[var(--bg)] rounded-md px-2 py-0.5 uppercase tracking-wide">{sourceLabel(card)}</span>
                </div>
                <div className="flex items-center gap-6 flex-wrap mt-2">
                  <HealthBar score={card.latestHealth} width={64} />
                  <TrendBadge trend={card.trend} showLabel />
                  {card.healthHistory.length >= 2 && <div className="w-28 h-8">
                    <DitherSparkline data={card.healthHistory.slice(-12)} color={healthTone(card.latestHealth)} hovered={hoveredCard === card.name} bloom="low" bloomOnHover />
                  </div>}
                  {card.insight && <span className="text-xs text-[var(--text-muted)] font-mono">{card.insight.tableCount} table{card.insight.tableCount !== 1 ? "s" : ""}</span>}
                  {isProtocols && card.mintCount > 0 && <span className="text-xs text-[var(--text-muted)] font-mono">{card.mintCount} mint{card.mintCount !== 1 ? "s" : ""} · {card.wallets} wallet{card.wallets !== 1 ? "s" : ""}</span>}
                </div>
                {cost && <div className="text-xs text-[var(--danger)] mt-2">{cost}</div>}
              </div>
              {episodeId && <div className="flex gap-2 items-center">
                <DitherButton color="purple" variant="gradient" onClick={() => onListen(episodeId)} className="px-4 py-2 text-sm font-medium">▶ Listen</DitherButton>
                <Link href={`/episode/${episodeId}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] text-xs transition-colors">Full report →</Link>
              </div>}
            </div>

            {card.insight && <details className="group border-t border-[var(--border)] mt-4 pt-3">
              <summary className="text-xs font-medium text-[var(--text-muted)] cursor-pointer list-none flex items-center gap-1.5 hover:text-[var(--text)]">
                <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                Engine analysis · {new Date(card.insight.recordedAt).toLocaleDateString()}
              </summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CoverageBar label="Test coverage" value={card.insight.testCoverage} />
                  <CoverageBar label="Documentation" value={card.insight.docCoverage} color="var(--success)" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <MiniStat value={card.insight.failingTests} label="Failing" />
                  <MiniStat value={card.insight.untestedCount} label="Untested" />
                  <MiniStat value={card.insight.ownerlessCount} label="No owner" />
                </div>
                <CriticalTablesList tables={card.insight.criticalTables} />
                <HotspotChips hotspots={card.insight.lineageHotspots} />
              </div>
            </details>}

            {isProtocols && card.recentMints.length > 0 && <div className="border-t border-[var(--border)] mt-4 pt-4">
              <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Recent on-chain records</div>
              <div className="flex flex-col gap-1">
                {card.recentMints.slice(0, 3).map((mint) => (
                  <div key={mint.txSignature} className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded-md bg-[var(--bg)] text-[var(--text-muted)]">
                    <a href={mint.network === "mainnet-beta" ? `https://explorer.solana.com/tx/${mint.txSignature}` : `https://explorer.solana.com/tx/${mint.txSignature}?cluster=${mint.network}`} target="_blank" rel="noopener noreferrer" className="font-mono truncate no-underline hover:text-[var(--text)]">
                      {mint.txSignature.slice(0, 10)}…{mint.txSignature.slice(-6)}
                    </a>
                    <span className="flex items-center gap-3 shrink-0">
                      <Link href={`/verify?tx=${mint.txSignature}`} className="text-[var(--accent)] no-underline hover:underline font-mono">Verify</Link>
                      <span className="font-mono">{new Date(mint.createdAt).toLocaleDateString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>}

            {isProtocols && <BadgePanel schemaName={card.displayName} />}
          </article>
        );
      })}
    </section>
  );
}
