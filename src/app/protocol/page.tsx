"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MintRecord, AlertSubscription } from "@/lib/mint-stats";
import type { InsightSummary } from "@/app/api/insights/route";
import type { TrendNarrative } from "@/app/api/insights/trends/route";
import { costLine } from "@/lib/cost-framing";
import { track } from "@/lib/track";
import { HealthBar, TrendBadge, CoverageBar, MiniStat, CriticalTablesList, HotspotChips } from "@/components/viz";
import {
  LineChart,
  Line,
  Grid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Sparkline as DitherSparkline,
  DitherAvatar,
  DitherButton,
  DitherGradient,
  type DitherColor,
} from "@/components/dither-kit";

interface SourceCard {
  name: string;
  /** Human label — engine schemaName when known, else the group name */
  displayName: string;
  source: "the-graph" | "dune" | "unknown";
  latestHealth: number;
  trend: "up" | "down" | "stable";
  mintCount: number;
  wallets: number;
  lastActivity: string;
  recentMints: MintRecord[];
  /** Chronological health scores — engine snapshots when available, else mint ledger */
  healthHistory: number[];
  /** Latest engine analysis (SchemaInsights snapshot) — present for analyzed sources */
  insight?: InsightSummary;
}

function sourceLabel(card: SourceCard) {
  if (card.source === "the-graph") return "The Graph subgraph";
  if (card.source === "dune") return "Dune Analytics";
  return card.mintCount > 0 ? "Onchain" : "Warehouse / catalog";
}

function groupName(schemaName: string): string {
  return schemaName.split(".")[0] || schemaName;
}

function trendOf(history: number[]): SourceCard["trend"] {
  if (history.length < 2) return "stable";
  const latest = history[history.length - 1];
  const prev = history[history.length - 2];
  return latest > prev ? "up" : latest < prev ? "down" : "stable";
}

/** Map a 0–100 health score onto the dither palette. */
function healthDitherColor(score: number): DitherColor {
  return score >= 80 ? "green" : score >= 50 ? "orange" : "red";
}

const SERIES_COLORS: DitherColor[] = ["purple", "green", "orange", "blue", "pink"];

/** Fleet health — one dithered area series per tracked source, scrub to compare. */
function FleetHealthChart({ cards }: { cards: SourceCard[] }) {
  const { rows, config } = useMemo(() => {
    const series = cards.filter((c) => c.healthHistory.length >= 2).slice(0, 4);
    if (series.length === 0) return { rows: [], config: {} };

    const maxLen = Math.min(8, Math.max(...series.map((s) => s.healthHistory.length)));
    const rows = Array.from({ length: maxLen }, (_, i) => {
      const row: Record<string, number | string> = {
        t: i === maxLen - 1 ? "now" : `T-${maxLen - 1 - i}`,
      };
      for (const s of series) {
        const tail = s.healthHistory.slice(-maxLen);
        // Left-pad short series with their first reading so every line spans the window
        row[s.name] = tail[i - (maxLen - tail.length)] ?? tail[0];
      }
      return row;
    });

    const config = Object.fromEntries(
      series.map((s, i) => [s.name, { label: s.displayName, color: SERIES_COLORS[i % SERIES_COLORS.length] }])
    );
    return { rows, config };
  }, [cards]);

  const seriesKeys = Object.keys(config);
  if (rows.length === 0) return null;

  return (
    <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 mb-6 overflow-hidden">
      <DitherGradient from="purple" direction="down" cell={3} opacity={0.14} className="absolute inset-x-0 top-0 h-20" />
      <div className="relative flex items-baseline justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Fleet health</div>
          <h2 className="text-sm font-semibold mt-0.5">Every source, last {rows.length} snapshots</h2>
        </div>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">scrub to compare · hover a legend entry to spotlight</span>
      </div>
      <div className="relative h-56 w-full pt-4">
        {/* Line variant, not area — four overlapping dither fills flood the plot */}
        <LineChart data={rows} config={config} animate bloom="low" margins={{ top: 18, right: 8, bottom: 22, left: 30 }}>
          <Grid />
          <XAxis dataKey="t" />
          <YAxis tickFormatter={(v) => `${v}`} />
          {seriesKeys.map((key) => (
            <Line key={key} dataKey={key} />
          ))}
          <Legend />
          <Tooltip labelKey="t" valueFormatter={(v) => `${Math.round(v)}%`} variant="frosted-glass" />
        </LineChart>
      </div>
    </div>
  );
}

export default function ProtocolDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg)]" />}>
      <ProtocolDashboardInner />
    </Suspense>
  );
}

function ProtocolDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const episodeId = searchParams.get("episode");
  const [cards, setCards] = useState<SourceCard[]>([]);
  const [alerts, setAlerts] = useState<AlertSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [episodeMeta, setEpisodeMeta] = useState<{ schemaName: string; tableCount: number; testsFailed: number; testsTotal: number; segments: number } | null>(null);
  const [trends, setTrends] = useState<TrendNarrative[]>([]);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const fetches: Promise<Response>[] = [
          fetch("/api/onchain/mints/stats?limit=200"),
          fetch("/api/insights"),
          fetch("/api/onchain/alerts"),
          fetch("/api/insights/trends"),
        ];
        if (episodeId) {
          fetches.push(fetch(`/api/share?id=${episodeId}`));
        }
        const responses = await Promise.all(fetches);
        const [mintsRes, insightsRes, alertsRes, trendsRes, episodeRes] = responses;
        const mints: { ok: boolean; recent: MintRecord[] } = await mintsRes.json();
        const insightsData: { ok: boolean; insights: InsightSummary[] } = await insightsRes.json();
        const alertsData: { ok: boolean; alerts: AlertSubscription[] } = await alertsRes.json();
        const trendsData: { ok: boolean; narratives: TrendNarrative[] } = await trendsRes.json();
        if (alertsData.ok) setAlerts(alertsData.alerts ?? []);
        if (trendsData.ok) setTrends(trendsData.narratives ?? []);

        if (episodeRes && episodeRes.ok) {
          const epData = await episodeRes.json();
          if (epData.ok && epData.episode) {
            const ep = epData.episode;
            setEpisodeMeta({
              schemaName: ep.schemaName,
              tableCount: ep.tableCount,
              testsFailed: ep.qualitySummary?.failed ?? 0,
              testsTotal: ep.qualitySummary?.total ?? 0,
              segments: ep.script?.length ?? 0,
            });
          }
        }

        // Group mints by source name
        const grouped: Record<string, MintRecord[]> = {};
        for (const m of mints.ok ? mints.recent : []) {
          const name = groupName(m.schemaName);
          (grouped[name] ??= []).push(m);
        }

        // Latest engine snapshot per source name — group by FQN prefix, same as mints
        const insightByName: Record<string, InsightSummary> = {};
        for (const ins of insightsData.ok ? insightsData.insights : []) {
          const name = groupName(ins.schemaFqn);
          // /api/insights is sorted newest-first — keep the first (latest) per group
          insightByName[name] ??= ins;
        }

        const names = [...new Set([...Object.keys(grouped), ...Object.keys(insightByName)])];
        const built: SourceCard[] = names.map((name) => {
          const records = (grouped[name] ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const insight = insightByName[name];
          const mintHistory = [...records].reverse().map((r) => r.healthScore);
          const healthHistory = insight && insight.healthHistory.length >= 2 ? insight.healthHistory : mintHistory;
          const latestHealth = insight?.healthScore ?? records[0]?.healthScore ?? 0;
          const wallets = [...new Set(records.map((r) => r.walletAddress))];

          let source: SourceCard["source"] = "unknown";
          if (name.toLowerCase().includes("graph") || name.toLowerCase().includes("subgraph")) {
            source = "the-graph";
          } else if (name.toLowerCase().includes("dune")) {
            source = "dune";
          }

          return {
            name,
            displayName: insight?.schemaName ?? name,
            source,
            latestHealth,
            trend: trendOf(healthHistory),
            mintCount: records.length,
            wallets: wallets.length,
            lastActivity: records[0]?.createdAt ?? insight?.recordedAt ?? "",
            recentMints: records.slice(0, 3),
            healthHistory,
            insight,
          };
        });

        built.sort((a, b) => b.latestHealth - a.latestHealth);
        setCards(built);
      } catch (e) {
        console.error("Failed to load analytics dashboard:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [episodeId]);

  const analyzed = cards.filter((c) => c.insight);
  const totalFailing = analyzed.reduce((s, c) => s + (c.insight?.failingTests ?? 0), 0);
  const avgHealth = cards.length > 0 ? Math.round(cards.reduce((s, c) => s + c.latestHealth, 0) / cards.length) : 0;
  const totalMints = cards.reduce((s, c) => s + c.mintCount, 0);

  return (
    <main className="relative min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-8 overflow-hidden">
      {/* Page-top dither wash — reads as a signal rising off the header */}
      <DitherGradient from="purple" direction="down" cell={4} opacity={0.16} className="absolute inset-x-0 top-0 h-44 pointer-events-none" />

      <div className="relative max-w-[900px] mx-auto">
        <div className="mb-8">
          <Link href="/" className="font-mono text-[11px] text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            ← DataBard
          </Link>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--accent)] mt-4">
            Data health · weekly signal
          </div>
          <h1 className="text-[28px] font-extrabold mt-1 mb-1">Analytics</h1>
          <p className="text-[var(--text-muted)] text-[15px]">
            Live health scores, coverage, and trends for every source DataBard analyzes — warehouses,
            catalogs, subgraphs, and Dune queries. On-chain sources carry permanent Solana records.
          </p>
          <div className="mt-3 flex items-center gap-4 font-mono text-[12px]">
            <Link href="/alerts" className="text-[var(--accent)] no-underline hover:underline">
              🔔 Manage alerts →
            </Link>
            <Link href="/verify" className="text-[var(--accent)] no-underline hover:underline">
              ⛓ Verify an attestation →
            </Link>
          </div>
        </div>

        {/* Fresh episode banner — "Listen to this analysis" */}
        {episodeId && episodeMeta && (
          <div className="relative bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-2xl p-5 mb-6 animate-slide-up overflow-hidden">
            <DitherGradient from="purple" direction="left" cell={3} opacity={0.12} className="absolute inset-y-0 right-0 w-1/2 pointer-events-none" />
            <div className="relative flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <DitherAvatar name={episodeMeta.schemaName} size={40} className="rounded-lg shrink-0" />
                <div>
                  <p className="text-sm font-semibold mb-1">✓ Analysis complete — {episodeMeta.schemaName}</p>
                  <p className="text-xs text-[var(--text-muted)] font-mono">
                    {episodeMeta.tableCount} tables · {episodeMeta.testsFailed}/{episodeMeta.testsTotal} tests failing · {episodeMeta.segments} segments
                  </p>
                </div>
              </div>
              <DitherButton
                color="purple"
                variant="gradient"
                bloom="low"
                onClick={() => {
                  track("dashboard_listen_click", { schema: episodeMeta?.schemaName ?? "" });
                  router.push(`/episode/${episodeId}`);
                }}
                className="px-5 py-2.5 text-sm font-semibold shrink-0"
              >
                ▶ Listen to this analysis
              </DitherButton>
            </div>

            {/* One-click schedule prompt */}
            <div className="relative mt-4 pt-4 border-t border-[var(--accent)]/20 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-[var(--text-muted)]">
                Want this every Monday? Set up a weekly digest for your team.
              </p>
              <Link
                href={`/pro?setup=1&schema=${encodeURIComponent(episodeMeta.schemaName)}&episode=${episodeId}`}
                onClick={() => track("schedule_setup", { schema: episodeMeta.schemaName, source: "dashboard_prompt" })}
                className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1"
              >
                Set up weekly digest →
              </Link>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center p-12 text-[var(--text-muted)] font-mono text-sm">
            Loading analytics…
          </div>
        )}

        {!loading && cards.length === 0 && (
          <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl p-12 text-center">
            <p className="text-[var(--text-muted)] mb-4 text-sm">No data sources analyzed yet.</p>
            <Link href="/" className="bg-[var(--accent)] text-[var(--bg)] px-6 py-2 rounded-lg text-sm font-medium inline-block">
              Generate your first health report
            </Link>
          </div>
        )}

        {/* Summary counters — dithered sparks over mono labels */}
        {!loading && cards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
              <div className="text-2xl font-extrabold tabular-nums">{cards.length}</div>
              <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-1">Sources tracked</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
              <div className="flex items-end justify-between gap-2">
                <div className="text-2xl font-extrabold tabular-nums" style={{ color: `var(--${avgHealth >= 80 ? "success" : avgHealth >= 50 ? "warning" : "danger"})` }}>{avgHealth}%</div>
                <div className="w-16 h-7 mb-0.5">
                  <DitherSparkline
                    data={cards[0]?.healthHistory.slice(-8) ?? []}
                    color={healthDitherColor(avgHealth)}
                    bloom="aura"
                  />
                </div>
              </div>
              <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-1">Avg health</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
              <div className="text-2xl font-extrabold tabular-nums" style={totalFailing > 0 ? { color: "var(--danger)" } : undefined}>{totalFailing}</div>
              <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-1">Failing tests</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
              <div className="text-2xl font-extrabold tabular-nums">{totalMints}</div>
              <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-1">⛓ On-chain records</div>
            </div>
          </div>
        )}

        {/* Fleet health chart — the differentiated centerpiece */}
        {!loading && <FleetHealthChart cards={cards} />}

        {/* What changed this week — trend narratives */}
        {!loading && trends.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">▚▚</span>
              <span>What changed this week</span>
            </h2>
            <div className="flex flex-col gap-2">
              {trends.slice(0, 5).map((t) => {
                const isSignificant = Math.abs(t.healthScoreChange) >= 5;
                const isImprovement = t.healthScoreChange > 0;
                const isDecline = t.healthScoreChange < 0;
                return (
                  <div
                    key={t.schemaFqn}
                    className={`rounded-xl p-4 border flex items-start gap-3 ${
                      isSignificant && isDecline
                        ? "border-[var(--danger)]/30 bg-[var(--danger)]/5"
                        : isSignificant && isImprovement
                        ? "border-[var(--success)]/30 bg-[var(--success)]/5"
                        : "border-[var(--border)] bg-[var(--surface)]"
                    }`}
                  >
                    <DitherAvatar name={groupName(t.schemaFqn)} size={28} className="rounded-md shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{t.schemaName}</span>
                        {t.healthScoreChange !== 0 && (
                          <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isImprovement
                              ? "bg-[var(--success)]/10 text-[var(--success)]"
                              : "bg-[var(--danger)]/10 text-[var(--danger)]"
                          }`}>
                            {isImprovement ? "↑" : "↓"} {Math.abs(t.healthScoreChange)}
                          </span>
                        )}
                        {!t.hasHistory && (
                          <span className="font-mono text-[10px] text-[var(--text-muted)] bg-[var(--bg)] px-1.5 py-0.5 rounded-full">new</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">{t.narrative}</p>
                    </div>
                    <span className={`text-lg font-bold tabular-nums shrink-0 ${
                      t.healthScore >= 80 ? "text-[var(--success)]"
                      : t.healthScore >= 50 ? "text-[var(--warning)]"
                      : "text-[var(--danger)]"
                    }`}>
                      {t.healthScore}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Source cards */}
        {!loading && (
          <div className="flex flex-col gap-4">
            {cards.map((card) => (
              <div
                key={card.name}
                onMouseEnter={() => setHoveredCard(card.name)}
                onMouseLeave={() => setHoveredCard(null)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--accent)]/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                      <DitherAvatar name={card.name} size={36} className="rounded-lg shrink-0" bloom="low" />
                      <h3 className="text-lg font-bold">{card.displayName}</h3>
                      <span className="font-mono text-[10px] text-[var(--text-muted)] bg-[var(--bg)] rounded-md px-2 py-0.5 uppercase tracking-wide">
                        {sourceLabel(card)}
                      </span>
                      {(() => {
                        const cardAlerts = alerts.filter((a) => groupName(a.schemaName) === card.name);
                        if (cardAlerts.length === 0) return null;
                        const firing = cardAlerts.some((a) => card.latestHealth < a.threshold);
                        return (
                          <Link
                            href="/alerts"
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${
                              firing
                                ? "bg-[var(--danger)]/20 text-[var(--danger)] hover:bg-[var(--danger)]/30"
                                : "bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20"
                            }`}
                            title={firing ? "Alert firing — health below threshold" : `${cardAlerts.length} alert${cardAlerts.length !== 1 ? "s" : ""} configured`}
                          >
                            {firing ? "🔴 Alert firing" : `🔔 ${cardAlerts.length} alert${cardAlerts.length !== 1 ? "s" : ""}`}
                          </Link>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-6 flex-wrap mt-2">
                      <HealthBar score={card.latestHealth} width={64} />
                      <TrendBadge trend={card.trend} showLabel />
                      {card.healthHistory.length >= 2 && (
                        <div className="w-28 h-8">
                          <DitherSparkline
                            data={card.healthHistory.slice(-12)}
                            color={healthDitherColor(card.latestHealth)}
                            hovered={hoveredCard === card.name}
                            bloom="low"
                            bloomOnHover
                          />
                        </div>
                      )}
                      {card.insight && (
                        <span className="text-xs text-[var(--text-muted)] font-mono">
                          {card.insight.tableCount} table{card.insight.tableCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {card.mintCount > 0 && (
                        <span className="text-xs text-[var(--text-muted)] font-mono">
                          {card.mintCount} mint{card.mintCount !== 1 ? "s" : ""} · {card.wallets} wallet{card.wallets !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {/* The cost, not just the score */}
                    {card.insight && (() => {
                      const cost = costLine({
                        failingTests: card.insight.failingTests,
                        downstreamAtRisk: card.insight.criticalTables.reduce((s, ct) => s + ct.downstreamCount, 0),
                        staleTables: card.insight.staleCount,
                        undocumentedTables: card.insight.undocumentedCount,
                        untestedTables: card.insight.untestedCount,
                      });
                      return cost ? (
                        <div className="text-xs text-[var(--danger)] mt-2">🔥 {cost}</div>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex gap-2 items-center">
                    {(() => {
                      // Latest episode for this source — engine snapshot first, mint ledger fallback
                      const episodeId = card.insight?.episodeId ?? card.recentMints[0]?.episodeId;
                      if (!episodeId) return null;
                      return (
                        <>
                          <DitherButton
                            color="purple"
                            variant="gradient"
                            onClick={() => router.push(`/episode/${episodeId}`)}
                            className="px-4 py-2 text-sm font-medium"
                          >
                            ▶ Listen
                          </DitherButton>
                          <Link
                            href={`/episode/${episodeId}`}
                            className="text-[var(--text-muted)] hover:text-[var(--accent)] text-xs transition-colors"
                          >
                            Full report →
                          </Link>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Engine analysis detail — coverage, critical tables, hotspots */}
                {card.insight && (
                  <details className="group border-t border-[var(--border)] mt-4 pt-3">
                    <summary className="text-xs font-medium text-[var(--text-muted)] cursor-pointer list-none flex items-center gap-1.5 hover:text-[var(--text)]">
                      <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                      Engine analysis · {new Date(card.insight.recordedAt).toLocaleDateString()}
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <CoverageBar label="Test coverage" value={card.insight.testCoverage} />
                        <CoverageBar label="Documentation" value={card.insight.docCoverage} color="var(--success)" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <MiniStat value={card.insight.failingTests} label="Failing" />
                        <MiniStat value={card.insight.untestedCount} label="Untested" />
                        <MiniStat value={card.insight.ownerlessCount} label="No owner" />
                      </div>
                      <CriticalTablesList tables={card.insight.criticalTables} />
                      <HotspotChips hotspots={card.insight.lineageHotspots} />
                    </div>
                  </details>
                )}

                {/* Recent mint signatures */}
                {card.recentMints.length > 0 && (
                  <div className="border-t border-[var(--border)] mt-4 pt-4">
                    <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">
                      Recent on-chain records
                    </div>
                    <div className="flex flex-col gap-1">
                      {card.recentMints.slice(0, 3).map((m) => (
                        <div
                          key={m.txSignature}
                          className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded-md bg-[var(--bg)] text-[var(--text-muted)]"
                        >
                          <a
                            href={
                              m.network === "mainnet-beta"
                                ? `https://explorer.solana.com/tx/${m.txSignature}`
                                : `https://explorer.solana.com/tx/${m.txSignature}?cluster=${m.network}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono truncate no-underline hover:text-[var(--text)]"
                          >
                            {m.txSignature.slice(0, 10)}…{m.txSignature.slice(-6)}
                          </a>
                          <span className="flex items-center gap-3 shrink-0">
                            <Link
                              href={`/verify?tx=${m.txSignature}`}
                              className="text-[var(--accent)] no-underline hover:underline font-mono"
                            >
                              ⛓ Verify
                            </Link>
                            <span className="font-mono">{new Date(m.createdAt).toLocaleDateString()}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="relative text-center pt-12 pb-4">
        <Link href="/leaderboard" className="font-mono text-[var(--text-muted)] text-xs no-underline hover:text-[var(--text)]">
          🏆 View leaderboard →
        </Link>
      </footer>
    </main>
  );
}
