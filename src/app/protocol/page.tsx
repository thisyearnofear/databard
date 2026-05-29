"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LeaderboardEntry, MintRecord } from "@/lib/mint-stats";

interface ProtocolSnapshot {
  name: string;
  source: "the-graph" | "dune" | "unknown";
  latestHealth: number;
  trend: "up" | "down" | "stable";
  mintCount: number;
  wallets: number;
  lastActivity: string;
  recentMints: MintRecord[];
}

function sourceLabel(source: ProtocolSnapshot["source"]) {
  if (source === "the-graph") return "The Graph subgraph";
  if (source === "dune") return "Dune Analytics";
  return "Onchain";
}

function sourceIcon(source: ProtocolSnapshot["source"]) {
  if (source === "the-graph") return "🕸️";
  if (source === "dune") return "📊";
  return "⛓️";
}

function HealthScore({ score }: { score: number }) {
  const color = score >= 80 ? "var(--success)" : score >= 50 ? "#f5c842" : "var(--danger)";
  return (
    <div className="flex items-center gap-2">
      <div style={{ width: 64, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: 14 }}>{score}%</span>
    </div>
  );
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <span style={{ color: "var(--success)", fontSize: 16 }}>↑ Improving</span>;
  if (trend === "down") return <span style={{ color: "var(--danger)", fontSize: 16 }}>↓ Declining</span>;
  return <span style={{ color: "var(--text-muted)", fontSize: 16 }}>→ Stable</span>;
}

export default function ProtocolDashboard() {
  const [protocols, setProtocols] = useState<ProtocolSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [leaderboardRes, mintsRes] = await Promise.all([
          fetch("/api/onchain/leaderboard?limit=50"),
          fetch("/api/onchain/mints/stats?limit=200"),
        ]);
        const leaderboard: { ok: boolean; entries: LeaderboardEntry[] } = await leaderboardRes.json();
        const mints: { ok: boolean; recent: MintRecord[] } = await mintsRes.json();

        if (!leaderboard.ok || !mints.ok) return;

        // Group by protocol name and infer source type from schema naming
        const grouped: Record<string, MintRecord[]> = {};
        for (const m of mints.recent) {
          const name = m.schemaName.split(".")[0] || m.schemaName;
          if (!grouped[name]) grouped[name] = [];
          grouped[name].push(m);
        }

        const snapshots: ProtocolSnapshot[] = Object.entries(grouped).map(([name, records]) => {
          const sorted = records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const latest = sorted[0].healthScore;
          const prev = sorted[1]?.healthScore ?? latest;
          const wallets = [...new Set(records.map((r) => r.walletAddress))];

          // Infer source type from schema name patterns
          let source: ProtocolSnapshot["source"] = "unknown";
          if (name.toLowerCase().includes("graph") || name.toLowerCase().includes("subgraph")) {
            source = "the-graph";
          } else if (name.toLowerCase().includes("dune")) {
            source = "dune";
          }

          return {
            name,
            source,
            latestHealth: latest,
            trend: latest > prev ? "up" : latest < prev ? "down" : "stable",
            mintCount: records.length,
            wallets: wallets.length,
            lastActivity: sorted[0].createdAt,
            recentMints: sorted.slice(0, 3),
          };
        });

        snapshots.sort((a, b) => b.latestHealth - a.latestHealth);
        setProtocols(snapshots);
      } catch (e) {
        console.error("Failed to load protocol dashboard:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const graphProtocols = protocols.filter((p) => p.source === "the-graph");
  const duneProtocols = protocols.filter((p) => p.source === "dune");
  const otherProtocols = protocols.filter((p) => p.source === "unknown");

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/" style={{ color: "var(--text-muted)", fontSize: 14, textDecoration: "none" }}>
            ← Back to DataBard
          </Link>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: "1rem", marginBottom: "0.25rem" }}>
            📡 Protocol Health Dashboard
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
            Live health scores for onchain data sources — subgraphs, Dune queries, and protocol indexes.
            Each score is backed by a permanent on-chain record.
          </p>
        </div>

        {loading && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem" }}>
            Loading protocol data…
          </div>
        )}

        {!loading && protocols.length === 0 && (
          <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl p-12 text-center">
            <p className="text-[var(--text-muted)] mb-4 text-sm">No onchain protocols have been minted yet.</p>
            <Link href="/" className="bg-[var(--accent)] text-white px-6 py-2 rounded-lg text-sm font-medium inline-block">
              Mint your first health report
            </Link>
          </div>
        )}

        {/* Summary counters */}
        {!loading && protocols.length > 0 && (
          <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            {[
              { label: "Protocols tracked", value: protocols.length, icon: "📡" },
              { label: "Subgraphs", value: graphProtocols.length, icon: "🕸️" },
              { label: "Dune namespaces", value: duneProtocols.length, icon: "📊" },
              { label: "Total mints", value: protocols.reduce((s, p) => s + p.mintCount, 0), icon: "⛓️" },
            ].map((c) => (
              <div key={c.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-3 flex-1 min-w-[140px] text-center">
                <div style={{ fontSize: 18 }}>{c.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{c.value}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {c.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Protocol cards */}
        {!loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[...graphProtocols, ...duneProtocols, ...otherProtocols].map((protocol) => (
              <div
                key={protocol.name}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--accent)]/50 transition-all"
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <span style={{ fontSize: 20 }}>{sourceIcon(protocol.source)}</span>
                      <h3 style={{ fontSize: 18, fontWeight: 700 }}>{protocol.name}</h3>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg)", borderRadius: 6, padding: "2px 8px" }}>
                        {sourceLabel(protocol.source)}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                      <HealthScore score={protocol.latestHealth} />
                      <TrendBadge trend={protocol.trend} />
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {protocol.mintCount} mint{protocol.mintCount !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {protocol.wallets} wallet{protocol.wallets !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {protocol.recentMints.length > 0 && (
                      <Link
                        href={`/episode/${protocol.recentMints[0].episodeId}`}
                        className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                      >
                        Latest report →
                      </Link>
                    )}
                  </div>
                </div>

                {/* Recent mint signatures */}
                {protocol.recentMints.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: "1rem", paddingTop: "1rem" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                      Recent on-chain records
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      {protocol.recentMints.slice(0, 3).map((m) => (
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
