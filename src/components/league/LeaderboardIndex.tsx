"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PublicLeaderboardEntry } from "@/app/api/onchain/leaderboard/route";
import { HealthBar, TrendBadge, Sparkline } from "@/components/viz";
import { LeadCapture } from "@/components/LeadCapture";
import { PixelIcon } from "@/components/dither-kit";
import { scoreColor } from "@/lib/product/score-tone";
import { homeHref } from "@/lib/product/workspaces";

type SortKey = "score" | "change" | "recent";
type FilterKey = "all" | "verified" | "scanned";

function delta(e: PublicLeaderboardEntry): number {
  return e.healthHistory.length >= 2 ? e.latestHealthScore - e.healthHistory[0] : 0;
}

function shortName(fqn: string): string {
  const parts = fqn.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : fqn;
}

function TierBadge({ tier }: { tier: PublicLeaderboardEntry["tier"] }) {
  const verified = tier === "verified";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${
        verified ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--text-muted)]"
      }`}
    >
      <PixelIcon name={verified ? "chain" : "search"} size={9} />
      {verified ? "Verified" : "Scanned"}
    </span>
  );
}

/** The full registry behind the weekly league: every source DataBard has indexed. */
export function LeaderboardIndex() {
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
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the index"))
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

  const bestDelta = useMemo(() => (entries.length ? Math.max(...entries.map(delta)) : 0), [entries]);

  if (loading) return <p className="font-mono text-sm text-[var(--text-muted)]">Loading the index…</p>;
  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;

  return (
    <section aria-label="Full index of indexed sources">
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        Every source DataBard has indexed. <TierBadge tier="scanned" /> scores come from the analysis
        engine; <TierBadge tier="verified" /> scores were attested on Solana by the team behind the source.
      </p>

      {entries.length === 0 ? (
        <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center">
          <p className="text-base font-bold mb-2">No sources indexed yet</p>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto mb-5">
            Every source DataBard analyzes appears here automatically. Be the first to claim your
            protocol and verify its health on Solana.
          </p>
          <Link
            href={homeHref("protocols")}
            className="inline-block px-5 py-2.5 bg-[var(--accent)] text-[var(--bg)] no-underline text-sm font-semibold hover:brightness-110"
          >
            Generate your first episode →
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center">
              <div className="font-display text-2xl font-extrabold tabular-nums">{stats.total}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1">Indexed</div>
            </div>
            <div className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center">
              <div className="font-display text-2xl font-extrabold tabular-nums text-[var(--accent)]">{stats.verified}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1">Verified on-chain</div>
            </div>
            <div className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center">
              <div className="font-display text-2xl font-extrabold tabular-nums" style={{ color: scoreColor(stats.avg) }}>{stats.avg}%</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1">Average health</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 border border-[var(--border)] bg-[var(--surface)] p-1">
              {([["score", "Score"], ["change", "Change"], ["recent", "Recent"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                    sort === key ? "bg-[var(--accent)] text-[var(--bg)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 border border-[var(--border)] bg-[var(--surface)] p-1">
              {([["all", "All"], ["verified", "Verified"], ["scanned", "Scanned"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                    filter === key ? "bg-[var(--accent)] text-[var(--bg)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
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
              className="min-w-[140px] flex-1 border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          {visible.length === 0 ? (
            <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center">
              <p className="text-sm mb-3">No sources match your filters.</p>
              <button
                onClick={() => { setFilter("all"); setQuery(""); }}
                className="px-4 py-2 bg-[var(--accent)] text-[var(--bg)] text-xs font-semibold hover:brightness-110"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {visible.map((entry, i) => {
                const isMostImproved = bestDelta > 0 && delta(entry) === bestDelta;
                return (
                  <li
                    key={entry.schemaName}
                    className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center font-mono text-xs font-bold ${
                          i < 3 ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--text-muted)]"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-[160px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold" title={entry.schemaName}>{shortName(entry.schemaName)}</span>
                          <TierBadge tier={entry.tier} />
                          {isMostImproved && (
                            <span className="bg-[var(--success)] px-2 py-0.5 text-xs font-semibold text-[var(--bg)]">
                              ▲ Most improved
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {entry.tier === "verified" ? (
                            <>
                              {entry.wallets.length} wallet{entry.wallets.length !== 1 ? "s" : ""} · {entry.mintCount} mint{entry.mintCount !== 1 ? "s" : ""} · last{" "}
                              {new Date(entry.lastMintedAt).toLocaleDateString()}
                            </>
                          ) : (
                            <>scanned {new Date(entry.lastMintedAt).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <Sparkline values={entry.healthHistory} width={72} height={24} />
                      </div>
                      <div className="w-[92px] shrink-0">
                        <HealthBar score={entry.latestHealthScore} width={92} />
                      </div>
                      <div className="w-6 shrink-0 text-center">
                        <TrendBadge trend={entry.trend} />
                      </div>
                      <img
                        src={`/api/badge/${encodeURIComponent(entry.schemaName)}`}
                        alt={`Health badge for ${entry.schemaName}`}
                        className="h-5 shrink-0"
                      />
                      {entry.tier === "scanned" ? (
                        <button
                          onClick={() => setClaimingSchema(claimingSchema === entry.schemaName ? null : entry.schemaName)}
                          className="shrink-0 bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] hover:brightness-110"
                        >
                          {claimingSchema === entry.schemaName ? "Cancel" : "Claim →"}
                        </button>
                      ) : (
                        <span className="w-[76px] shrink-0 text-center text-xs font-semibold text-[var(--success)]">✓ Claimed</span>
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
                  </li>
                );
              })}
            </ol>
          )}

          <p className="mt-6 text-center text-[11px] text-[var(--text-muted)]">
            Scores sourced from on-chain Solana mints via DataBard ·{" "}
            <Link href="/api/onchain/leaderboard" className="text-[var(--accent)]">JSON API</Link>
          </p>
        </>
      )}
    </section>
  );
}
