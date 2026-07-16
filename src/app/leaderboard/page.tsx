"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PublicLeaderboardEntry } from "@/app/api/onchain/leaderboard/route";
import { HealthBar, TrendBadge, Sparkline } from "@/components/viz";
import { LeadCapture } from "@/components/LeadCapture";
import { homeHref } from "@/lib/product/workspaces";

type SortKey = "score" | "change" | "recent";
type FilterKey = "all" | "verified" | "scanned";

function delta(e: PublicLeaderboardEntry): number {
  return e.healthHistory.length >= 2 ? e.latestHealthScore - e.healthHistory[0] : 0;
}

function scoreColor(score: number): string {
  return score >= 80 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--danger)";
}

function shortName(fqn: string): string {
  const parts = fqn.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : fqn;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<PublicLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingSchema, setClaimingSchema] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("score");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

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

  const stats = useMemo(() => {
    if (entries.length === 0) return { total: 0, verified: 0, avg: 0 };
    const verified = entries.filter((e) => e.tier === "verified").length;
    const avg = Math.round(entries.reduce((s, e) => s + e.latestHealthScore, 0) / entries.length);
    return { total: entries.length, verified, avg };
  }, [entries]);

  const visible = useMemo(() => {
    let list = entries.slice();
    if (filter !== "all") list = list.filter((e) => e.tier === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((e) => e.schemaName.toLowerCase().includes(q));
    }
    if (sort === "score") list.sort((a, b) => b.latestHealthScore - a.latestHealthScore);
    else if (sort === "change") list.sort((a, b) => delta(b) - delta(a));
    else if (sort === "recent") list.sort((a, b) => b.lastMintedAt.localeCompare(a.lastMintedAt));
    return list;
  }, [entries, sort, filter, query]);

  const bestDelta = useMemo(
    () => (entries.length ? Math.max(...entries.map(delta)) : 0),
    [entries],
  );

  return (
    <main className="enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href={homeHref("protocols")} className="text-[var(--text-muted)] text-sm no-underline hover:text-[var(--text)] transition-colors">
            ← Back to DataBard
          </Link>
          <h1 className="text-[34px] font-extrabold mt-4 mb-2 tracking-tight">
            🏆 Data Health Leaderboard
          </h1>
          <p className="text-[var(--text-muted)] text-[15px] max-w-2xl">
            The public index of data-source health. <b>🔍 Scanned</b> scores come from DataBard&apos;s analysis
            engine; <b>⛓️ Verified</b> scores were attested on Solana by the team behind the source.
          </p>
        </div>

        {/* Stats summary bar */}
        {!loading && !error && entries.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-4 text-center">
              <div className="text-3xl font-extrabold tabular-nums">{stats.total}</div>
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Sources indexed</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-4 text-center">
              <div className="text-3xl font-extrabold tabular-nums text-[var(--accent)]">{stats.verified}</div>
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Verified on-chain ⛓️</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-4 text-center">
              <div className="text-3xl font-extrabold tabular-nums" style={{ color: scoreColor(stats.avg) }}>{stats.avg}%</div>
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Average health</div>
            </div>
          </div>
        )}

        {/* Controls: sort + filter + search */}
        {!loading && !error && entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
              {([["score", "By Score"], ["change", "By Change"], ["recent", "By Recent"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                    sort === key
                      ? "bg-[var(--accent)] text-[var(--bg)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
              {([["all", "All"], ["verified", "Verified ⛓️"], ["scanned", "Scanned 🔍"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                    filter === key
                      ? "bg-[var(--accent)] text-[var(--bg)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sources…"
              className="flex-1 min-w-[180px] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        )}

        {loading && (
          <div className="text-center p-20 text-[var(--text-muted)]">
            Loading leaderboard…
          </div>
        )}

        {error && (
          <div className="text-[var(--danger)] p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="text-center p-20 bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
            <div className="text-5xl mb-4">🗺️</div>
            <p className="text-xl font-bold mb-2">No sources indexed yet</p>
            <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto mb-6">
              Every source DataBard analyzes appears here automatically. Be the first to claim your
              protocol and verify its health on Solana.
            </p>
            <Link
              href={homeHref("protocols")}
              className="inline-block px-6 py-3 bg-[var(--accent)] text-[var(--bg)] rounded-lg no-underline font-semibold hover:opacity-90 transition-opacity"
            >
              Generate your first episode →
            </Link>
          </div>
        )}

        {/* No results after filtering */}
        {!loading && !error && entries.length > 0 && visible.length === 0 && (
          <div className="text-center p-16 text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
            <p className="text-lg mb-1">No sources match your filters.</p>
            <button
              onClick={() => { setFilter("all"); setQuery(""); }}
              className="mt-3 px-4 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Rows */}
        {!loading && !error && visible.length > 0 && (
          <div className="flex flex-col gap-3">
            {visible.map((entry, i) => {
              const isMostImproved = bestDelta > 0 && delta(entry) === bestDelta;
              return (
                <div
                  key={entry.schemaName}
                  className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap"
                >
                  {/* Rank */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-base shrink-0 ${
                      i < 3 ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--text-muted)]"
                    }`}
                  >
                    {i + 1}
                  </div>

                  {/* Source name + badge + meta */}
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-[16px]" title={entry.schemaName}>{shortName(entry.schemaName)}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          entry.tier === "verified"
                            ? "bg-[var(--accent)] text-[var(--bg)]"
                            : "bg-[var(--border)] text-[var(--text-muted)]"
                        }`}
                      >
                        {entry.tier === "verified" ? "⛓️ Verified" : "🔍 Scanned"}
                      </span>
                      {isMostImproved && (
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
                        <>scanned {new Date(entry.lastMintedAt).toLocaleDateString()}</>
                      )}
                    </div>
                    {entry.tier === "scanned" && claimingSchema === entry.schemaName && (
                      <div className="mt-3">
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
                  <div className="shrink-0">
                    <Sparkline values={entry.healthHistory} width={80} height={28} />
                  </div>

                  {/* Health score with color coding */}
                  <div className="shrink-0 min-w-[120px]">
                    <HealthBar score={entry.latestHealthScore} width={100} />
                  </div>

                  {/* Trend */}
                  <div className="shrink-0 w-8 text-center">
                    <TrendBadge trend={entry.trend} />
                  </div>

                  {/* Badge SVG */}
                  <img
                    src={`/api/badge/${encodeURIComponent(entry.schemaName)}`}
                    alt={`Health badge for ${entry.schemaName}`}
                    className="h-5 shrink-0"
                  />

                  {/* Claim button (scanned only) */}
                  {entry.tier === "scanned" ? (
                    <button
                      onClick={() => setClaimingSchema(claimingSchema === entry.schemaName ? null : entry.schemaName)}
                      className="shrink-0 px-4 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-lg text-sm font-semibold no-underline hover:opacity-90 transition-opacity"
                    >
                      {claimingSchema === entry.schemaName ? "Cancel" : "Claim →"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-[var(--success)] font-semibold w-[88px] text-center">✓ Claimed</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-[var(--text-muted)] text-xs text-center">
          Scores sourced from on-chain Solana mints via DataBard · <Link href="/api/onchain/leaderboard" className="text-[var(--accent)]">JSON API</Link>
        </p>
      </div>
    </main>
  );
}
