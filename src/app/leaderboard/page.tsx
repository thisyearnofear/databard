"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicLeaderboardEntry } from "@/app/api/onchain/leaderboard/route";
import { HealthBar, TrendBadge, Sparkline } from "@/components/viz";

function delta(e: PublicLeaderboardEntry): number {
  return e.healthHistory.length >= 2 ? e.latestHealthScore - e.healthHistory[0] : 0;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<PublicLeaderboardEntry[]>([]);
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
            The public index of data-source health. <b>🔍 Scanned</b> scores come from DataBard&apos;s analysis
            engine; <b>⛓️ Verified</b> scores were attested on Solana by the team behind the source.
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
            <p style={{ fontSize: 18, marginBottom: "0.5rem" }}>No sources indexed yet.</p>
            <p style={{ fontSize: 14 }}>
              Every source DataBard analyzes appears here automatically — mint on Solana to verify yours.
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

        {entries.length > 0 && (() => {
          const bestDelta = Math.max(...entries.map(delta));
          const mostImproved = bestDelta > 0 ? entries.find((e) => delta(e) === bestDelta)?.schemaName : null;
          return (
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
                    flexWrap: "wrap",
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

                  {/* Schema name + tier + activity */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{entry.schemaName}</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: entry.tier === "verified" ? "var(--accent)" : "var(--border)",
                          color: entry.tier === "verified" ? "#fff" : "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {entry.tier === "verified" ? "⛓️ Verified" : "🔍 Scanned"}
                      </span>
                      {entry.schemaName === mostImproved && (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--success)", color: "#fff", fontWeight: 600 }}>
                          ▲ Most improved
                        </span>
                      )}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {entry.tier === "verified" ? (
                        <>
                          {entry.wallets.length} wallet{entry.wallets.length !== 1 ? "s" : ""} · {entry.mintCount} mint{entry.mintCount !== 1 ? "s" : ""} · last{" "}
                          {new Date(entry.lastMintedAt).toLocaleDateString()}
                        </>
                      ) : (
                        <>
                          scanned {new Date(entry.lastMintedAt).toLocaleDateString()} ·{" "}
                          <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>
                            Claim your protocol →
                          </Link>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Sparkline */}
                  <Sparkline values={entry.healthHistory} width={72} height={24} />

                  {/* Health bar */}
                  <HealthBar score={entry.latestHealthScore} width={80} />

                  {/* Trend */}
                  <TrendBadge trend={entry.trend} />
                </div>
              ))}
            </div>
          );
        })()}

        <p style={{ marginTop: "2rem", color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
          Scores sourced from on-chain Solana mints via DataBard · <Link href="/api/onchain/leaderboard" style={{ color: "var(--accent)" }}>JSON API</Link>
        </p>
      </div>
    </main>
  );
}
