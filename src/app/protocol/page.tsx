"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MintRecord } from "@/lib/mint-stats";
import type { InsightSummary } from "@/app/api/insights/route";
import type { TrendNarrative } from "@/app/api/insights/trends/route";
import { track } from "@/lib/track";
import { homeHref, workspaceFromSearch, workspaceHref } from "@/lib/product/workspaces";
import { briefingSourceName, healthTrend } from "@/lib/briefing-health";
import { DashboardHeader } from "@/components/briefing/DashboardHeader";
import { PriorityBriefingCard } from "@/components/briefing/PriorityBriefingCard";
import { DashboardSummary } from "@/components/briefing/DashboardSummary";
import { ChangeNarratives } from "@/components/briefing/ChangeNarratives";
import { SourceHealthList } from "@/components/briefing/SourceHealthList";
import type { BriefingEpisodeMeta, SourceCard } from "@/components/briefing/types";
import {
  LineChart,
  Line,
  Grid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  DitherGradient,
  type DitherColor,
} from "@/components/dither-kit";

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
    <div className="hover-depth relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 mb-6 overflow-hidden">
      <DitherGradient from="purple" direction="down" cell={3} opacity={0.14} className="absolute inset-x-0 top-0 h-20" />
      <div className="relative flex items-baseline justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Fleet health</div>
          <h2 className="text-sm font-semibold mt-0.5">Every source, last {rows.length} snapshots</h2>
        </div>
        <span className="font-mono text-xs text-[var(--text-muted)]">scrub to compare · hover a legend entry to spotlight</span>
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
  const workspace = workspaceFromSearch(searchParams.toString());
  const isProtocols = workspace === "protocols";
  const isDemo = searchParams.get("demo") === "1";
  const [cards, setCards] = useState<SourceCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [episodeMeta, setEpisodeMeta] = useState<BriefingEpisodeMeta | null>(null);
  const [trends, setTrends] = useState<TrendNarrative[]>([]);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [insightsRes, trendsRes, mintsRes, episodeRes] = await Promise.all([
          fetch("/api/insights"),
          fetch("/api/insights/trends"),
          isProtocols ? fetch("/api/onchain/mints/stats?limit=200") : Promise.resolve(null),
          episodeId ? fetch(`/api/share?id=${episodeId}`) : Promise.resolve(null),
        ]);
        const mints: { ok: boolean; recent: MintRecord[] } = mintsRes
          ? await mintsRes.json()
          : { ok: true, recent: [] };
        const insightsData: { ok: boolean; insights: InsightSummary[] } = await insightsRes.json();
        const trendsData: { ok: boolean; narratives: TrendNarrative[] } = await trendsRes.json();
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
          const name = briefingSourceName(m.schemaName);
          (grouped[name] ??= []).push(m);
        }

        // Latest engine snapshot per source name — group by FQN prefix, same as mints
        const insightByName: Record<string, InsightSummary> = {};
        for (const ins of insightsData.ok ? insightsData.insights : []) {
          const name = briefingSourceName(ins.schemaFqn);
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
            trend: healthTrend(healthHistory),
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
  }, [episodeId, isProtocols]);

  const analyzed = cards.filter((c) => c.insight);
  const totalFailing = analyzed.reduce((s, c) => s + (c.insight?.failingTests ?? 0), 0);
  const avgHealth = cards.length > 0 ? Math.round(cards.reduce((s, c) => s + c.latestHealth, 0) / cards.length) : 0;
  const totalMints = cards.reduce((s, c) => s + c.mintCount, 0);

  return (
    <main className="enter-up relative min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-8 overflow-hidden">
      {isProtocols && <DitherGradient from="purple" direction="down" cell={4} opacity={0.16} className="absolute inset-x-0 top-0 h-44 pointer-events-none" />}

      <div className="relative max-w-[900px] mx-auto">
        <DashboardHeader isProtocols={isProtocols} />

        {isDemo && (
          <section className="mb-6 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3" aria-label="Sample briefing">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">Sample briefing</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">This is example data. Connect your source to see the risks and next actions in your own data.</p>
              </div>
              <Link
                href={workspaceHref("/?start=connect", workspace)}
                className="shrink-0 bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110"
              >
                Analyse my data →
              </Link>
            </div>
          </section>
        )}

        {/* Fresh episode banner — "Listen to this analysis" */}
        {episodeId && episodeMeta && <PriorityBriefingCard
          episodeId={episodeId}
          episode={episodeMeta}
          isProtocols={isProtocols}
          onListen={() => {
            track("dashboard_listen_click", { schema: episodeMeta.schemaName });
            router.push(workspaceHref(`/episode/${episodeId}`, workspace));
          }}
          onSchedule={() => track("schedule_setup", { schema: episodeMeta.schemaName, source: "dashboard_prompt" })}
        />}

        {loading && (
          <div className="text-center p-12 text-[var(--text-muted)] font-mono text-sm">
            Loading analytics…
          </div>
        )}

        {!loading && cards.length === 0 && (
          <div className="hover-depth bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl p-12 text-center">
            <p className="text-[var(--text-muted)] mb-4 text-sm">No data sources analyzed yet.</p>
            <Link href={homeHref(workspace)} className="bg-[var(--accent)] text-[var(--bg)] px-6 py-2 rounded-lg text-sm font-medium inline-block">
              Generate your first health report
            </Link>
          </div>
        )}

        {/* Summary counters — dithered sparks over mono labels */}
        {!loading && cards.length > 0 && <DashboardSummary cards={cards} avgHealth={avgHealth} totalFailing={totalFailing} totalMints={totalMints} isProtocols={isProtocols} />}

        {/* What changed this week — trend narratives */}
        {!loading && <ChangeNarratives trends={trends} />}

        {/* Evidence follows the decision narrative; it should not compete with it. */}
        {!loading && <FleetHealthChart cards={cards} />}

        {!loading && <SourceHealthList
          cards={cards}
          isProtocols={isProtocols}
          hoveredCard={hoveredCard}
          onHoverChange={setHoveredCard}
          onListen={(sourceEpisodeId) => router.push(workspaceHref(`/episode/${sourceEpisodeId}`, workspace))}
        />}
      </div>

      {isProtocols && <footer className="relative text-center pt-12 pb-4">
        <Link href={workspaceHref("/leaderboard", workspace)} className="font-mono text-[var(--text-muted)] text-xs no-underline hover:text-[var(--text)]">View protocol explorer →</Link>
      </footer>}
    </main>
  );
}
