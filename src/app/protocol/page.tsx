"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MintRecord, AlertSubscription } from "@/lib/mint-stats";
import type { InsightSummary } from "@/app/api/insights/route";
import { costLine } from "@/lib/cost-framing";
import { HealthBar, TrendBadge, Sparkline, StatTile, CoverageBar, MiniStat, CriticalTablesList, HotspotChips } from "@/components/viz";

interface SourceCard {
  name: string;
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

function sourceIcon(card: SourceCard) {
  if (card.source === "the-graph") return "🕸️";
  if (card.source === "dune") return "📊";
  return card.mintCount > 0 ? "⛓️" : "🗄️";
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

export default function ProtocolDashboard() {
  const [cards, setCards] = useState<SourceCard[]>([]);
  const [alerts, setAlerts] = useState<AlertSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [mintsRes, insightsRes, alertsRes] = await Promise.all([
          fetch("/api/onchain/mints/stats?limit=200"),
          fetch("/api/insights"),
          fetch("/api/onchain/alerts"),
        ]);
        const mints: { ok: boolean; recent: MintRecord[] } = await mintsRes.json();
        const insightsData: { ok: boolean; insights: InsightSummary[] } = await insightsRes.json();
        const alertsData: { ok: boolean; alerts: AlertSubscription[] } = await alertsRes.json();
        if (alertsData.ok) setAlerts(alertsData.alerts ?? []);

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
  }, []);

  const analyzed = cards.filter((c) => c.insight);
  const totalFailing = analyzed.reduce((s, c) => s + (c.insight?.failingTests ?? 0), 0);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/" style={{ color: "var(--text-muted)", fontSize: 14, textDecoration: "none" }}>
            ← Back to DataBard
          </Link>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: "1rem", marginBottom: "0.25rem" }}>
            📊 Data Health Analytics
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
            Live health scores, coverage, and trends for every data source DataBard analyzes — warehouses,
            catalogs, subgraphs, and Dune queries. On-chain sources carry permanent Solana records.
          </p>
          <div style={{ marginTop: "0.75rem" }}>
            <Link href="/alerts" style={{ color: "var(--accent)", fontSize: 13, textDecoration: "none" }}>
              🔔 Manage alerts →
            </Link>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem" }}>
            Loading analytics…
          </div>
        )}

        {!loading && cards.length === 0 && (
          <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl p-12 text-center">
            <p className="text-[var(--text-muted)] mb-4 text-sm">No data sources analyzed yet.</p>
            <Link href="/" className="bg-[var(--accent)] text-white px-6 py-2 rounded-lg text-sm font-medium inline-block">
              Generate your first health report
            </Link>
          </div>
        )}

        {/* Summary counters */}
        {!loading && cards.length > 0 && (
          <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            <StatTile icon="📡" value={cards.length} label="Sources tracked" />
            <StatTile
              icon="💚"
              value={`${Math.round(cards.reduce((s, c) => s + c.latestHealth, 0) / cards.length)}%`}
              label="Avg health"
            />
            {analyzed.length > 0 && <StatTile icon="🧪" value={totalFailing} label="Failing tests" />}
            <StatTile icon="⛓️" value={cards.reduce((s, c) => s + c.mintCount, 0)} label="On-chain records" />
          </div>
        )}

        {/* Source cards */}
        {!loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {cards.map((card) => (
              <div
                key={card.name}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--accent)]/50 transition-all"
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <span style={{ fontSize: 20 }}>{sourceIcon(card)}</span>
                      <h3 style={{ fontSize: 18, fontWeight: 700 }}>{card.name}</h3>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg)", borderRadius: 6, padding: "2px 8px" }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                      <HealthBar score={card.latestHealth} width={64} />
                      <TrendBadge trend={card.trend} showLabel />
                      <Sparkline values={card.healthHistory} />
                      {card.insight && (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {card.insight.tableCount} table{card.insight.tableCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {card.mintCount > 0 && (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
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
                        <div style={{ fontSize: 12, color: "var(--danger)", marginTop: "0.5rem" }}>🔥 {cost}</div>
                      ) : null;
                    })()}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {card.recentMints.length > 0 && (
                      <Link
                        href={`/episode/${card.recentMints[0].episodeId}`}
                        className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                      >
                        Latest report →
                      </Link>
                    )}
                  </div>
                </div>

                {/* Engine analysis detail — coverage, critical tables, hotspots */}
                {card.insight && (
                  <details className="group" style={{ borderTop: "1px solid var(--border)", marginTop: "1rem", paddingTop: "0.75rem" }}>
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
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: "1rem", paddingTop: "1rem" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                      Recent on-chain records
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      {card.recentMints.slice(0, 3).map((m) => (
                        <a
                          key={m.txSignature}
                          href={
                            m.network === "mainnet-beta"
                              ? `https://explorer.solana.com/tx/${m.txSignature}`
                              : `https://explorer.solana.com/tx/${m.txSignature}?cluster=${m.network}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            fontSize: 11,
                            padding: "4px 8px",
                            borderRadius: 6,
                            background: "var(--bg)",
                            color: "var(--text-muted)",
                            textDecoration: "none",
                          }}
                        >
                          <span style={{ fontFamily: "monospace" }}>
                            {m.txSignature.slice(0, 10)}…{m.txSignature.slice(-6)}
                          </span>
                          <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer style={{ textAlign: "center", paddingTop: "3rem", paddingBottom: "1rem" }}>
        <Link href="/leaderboard" style={{ color: "var(--text-muted)", fontSize: 12, textDecoration: "none" }}>
          🏆 View leaderboard →
        </Link>
      </footer>
    </main>
  );
}
