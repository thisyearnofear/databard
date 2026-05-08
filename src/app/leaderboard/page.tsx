"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LeaderboardEntry } from "@/lib/mint-stats";

function HealthBar({ score }: { score: number }) {
  const color = score >= 80 ? "var(--success)" : score >= 50 ? "#f5c842" : "var(--danger)";
  return (
    <div className="flex items-center gap-2">
      <div style={{ width: 80, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: 14 }}>{score}%</span>
    </div>
  );
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <span style={{ color: "var(--success)", fontSize: 16 }}>↑</span>;
  if (trend === "down") return <span style={{ color: "var(--danger)", fontSize: 16 }}>↓</span>;
  return <span style={{ color: "var(--text-muted)", fontSize: 16 }}>→</span>;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/onchain/leaderboard?limit=20")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setEntries(d.entries);
        else setError(d.error);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/" style={{ color: "var(--text-muted)", fontSize: 14, textDecoration: "none" }}>
            ← Back to DataBard
          </Link>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: "1rem", marginBottom: "0.25rem" }}>
            🏆 Data Health Leaderboard
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
            Public on-chain registry of protocol data health scores — updated every time an episode is minted on Solana.
          </p>
        </div>

        {loading && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem" }}>
            Loading leaderboard…
          </div>
        )}

        {error && (
          <div style={{ color: "var(--danger)", padding: "1rem", background: "var(--surface)", borderRadius: 8 }}>
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem" }}>
            <p style={{ fontSize: 18, marginBottom: "0.5rem" }}>No mints yet.</p>
            <p style={{ fontSize: 14 }}>
              Generate an episode and mint it on Solana — it will appear here automatically.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                marginTop: "1rem",
                padding: "0.6rem 1.4rem",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Generate an episode →
            </Link>
          </div>
        )}

        {entries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {entries.map((entry, i) => (
              <div
                key={entry.schemaName}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1rem 1.25rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                {/* Rank */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: i < 3 ? "var(--accent)" : "var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>

                {/* Schema name + wallets */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{entry.schemaName}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {entry.wallets.length} wallet{entry.wallets.length !== 1 ? "s" : ""} · {entry.mintCount} mint{entry.mintCount !== 1 ? "s" : ""} · last{" "}
                    {new Date(entry.lastMintedAt).toLocaleDateString()}
                  </div>
                </div>

                {/* Health bar */}
                <HealthBar score={entry.latestHealthScore} />

                {/* Trend */}
                <TrendBadge trend={entry.trend} />
              </div>
            ))}
          </div>
        )}

        <p style={{ marginTop: "2rem", color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
          Scores sourced from on-chain Solana mints via DataBard · <Link href="/api/onchain/leaderboard" style={{ color: "var(--accent)" }}>JSON API</Link>
        </p>
      </div>
    </main>
  );
}
