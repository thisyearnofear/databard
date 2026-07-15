"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicLeaderboardEntry } from "@/app/api/onchain/leaderboard/route";
import { HealthBar, TrendBadge, Sparkline } from "@/components/viz";
import { LeadCapture } from "@/components/LeadCapture";

function delta(e: PublicLeaderboardEntry): number {
  return e.healthHistory.length >= 2 ? e.latestHealthScore - e.healthHistory[0] : 0;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<PublicLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingSchema, setClaimingSchema] = useState<string | null>(null);

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
    <main className="enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-[var(--text-muted)] text-sm no-underline">
            ← Back to DataBard
          </Link>
          <h1 className="text-[28px] font-extrabold mt-4 mb-1">
            🏆 Data Health Leaderboard
          </h1>
          <p className="text-[var(--text-muted)] text-[15px]">
            The public index of data-source health. <b>🔍 Scanned</b> scores come from DataBard&apos;s analysis
            engine; <b>⛓️ Verified</b> scores were attested on Solana by the team behind the source.
          </p>
        </div>

        {loading && (
          <div className="text-center p-12 text-[var(--text-muted)]">
            Loading leaderboard…
          </div>
        )}

        {error && (
          <div className="text-[var(--danger)] p-4 bg-[var(--surface)] rounded-lg">
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-center p-12 text-[var(--text-muted)]">
            <p className="text-lg mb-2">No sources indexed yet.</p>
            <p className="text-sm">
              Every source DataBard analyzes appears here automatically — mint on Solana to verify yours.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 px-6 py-2.5 bg-[var(--accent)] text-[var(--bg)] rounded-lg no-underline font-semibold"
            >
              Generate an episode →
            </Link>
          </div>
        )}

        {entries.length > 0 && (() => {
          const bestDelta = Math.max(...entries.map(delta));
          const mostImproved = bestDelta > 0 ? entries.find((e) => delta(e) === bestDelta)?.schemaName : null;
          return (
            <div className="flex flex-col gap-3">
              {entries.map((entry, i) => (
                <div
                  key={entry.schemaName}
                  className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap"
                >
                  {/* Rank */}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm shrink-0 ${
                      i < 3 ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--text-muted)]"
                    }`}
                  >
                    {i + 1}
                  </div>

                  {/* Schema name + tier + activity */}
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-bold text-[15px]">{entry.schemaName}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          entry.tier === "verified"
                            ? "bg-[var(--accent)] text-[var(--bg)]"
                            : "bg-[var(--border)] text-[var(--text-muted)]"
                        }`}
                      >
                        {entry.tier === "verified" ? "⛓️ Verified" : "🔍 Scanned"}
                      </span>
                      {entry.schemaName === mostImproved && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--success)] text-[var(--bg)] font-semibold">
                          ▲ Most improved
                        </span>
                      )}
                    </div>
                    <div className="text-[var(--text-muted)] text-xs">
                      {entry.tier === "verified" ? (
                        <>
                          {entry.wallets.length} wallet{entry.wallets.length !== 1 ? "s" : ""} · {entry.mintCount} mint{entry.mintCount !== 1 ? "s" : ""} · last{" "}
                          {new Date(entry.lastMintedAt).toLocaleDateString()}
                        </>
                      ) : (
                        <>
                          scanned {new Date(entry.lastMintedAt).toLocaleDateString()} ·{" "}
                          <button
                            onClick={() => setClaimingSchema(claimingSchema === entry.schemaName ? null : entry.schemaName)}
                            className="text-[var(--accent)] no-underline hover:underline cursor-pointer"
                          >
                            {claimingSchema === entry.schemaName ? "Cancel" : "Claim your protocol →"}
                          </button>
                        </>
                      )}
                    </div>
                    {entry.tier === "scanned" && claimingSchema === entry.schemaName && (
                      <div className="mt-2">
                        <LeadCapture
                          source={`leaderboard_claim:${entry.schemaName}`}
                          prompt="Leave your email — we'll verify your protocol's health on Solana."
                          buttonText="Claim →"
                          compact
                        />
                      </div>
                    )}
                  </div>

                  {/* Sparkline */}
                  <Sparkline values={entry.healthHistory} width={72} height={24} />

                  {/* Health bar */}
                  <HealthBar score={entry.latestHealthScore} width={80} />

                  {/* Badge — live embeddable SVG */}
                  <img
                    src={`/api/badge/${encodeURIComponent(entry.schemaName)}`}
                    alt={`Health badge for ${entry.schemaName}`}
                    className="h-5"
                  />

                  {/* Trend */}
                  <TrendBadge trend={entry.trend} />
                </div>
              ))}
            </div>
          );
        })()}

        <p className="mt-8 text-[var(--text-muted)] text-xs text-center">
          Scores sourced from on-chain Solana mints via DataBard · <Link href="/api/onchain/leaderboard" className="text-[var(--accent)]">JSON API</Link>
        </p>
      </div>
    </main>
  );
}
