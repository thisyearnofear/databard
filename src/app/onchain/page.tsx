"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MintRecord, MintStats } from "@/lib/mint-stats";

function OnChainWallContent() {
  const searchParams = useSearchParams();
  const schemaFilter = searchParams.get("schema");
  
  const [stats, setStats] = useState<MintStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const url = schemaFilter 
          ? `/api/onchain/mints/stats?schema=${encodeURIComponent(schemaFilter)}&limit=50`
          : "/api/onchain/mints/stats?limit=50";
        const res = await fetch(url);
        const data = await res.json();
        if (data.ok) {
          setStats(data);
        } else {
          setError(data.error);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [schemaFilter]);

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[var(--text-muted)]">Loading on-chain records…</p>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="w-full max-w-4xl text-center space-y-4 animate-fade-in">
        <Link href="/" className="text-xs text-[var(--accent)] hover:underline mb-2 inline-block">
          ← Back to DataBard
        </Link>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          {schemaFilter ? `${schemaFilter.split(".").pop()} Attestations` : "Onchain Primitives"}
        </h1>
        <p className="text-[var(--text-muted)] max-w-xl mx-auto">
          {schemaFilter
            ? `Verifiable health attestations for ${schemaFilter}. Each record is a permanent anchor on Solana.`
            : "DataBard uses Solana as a verifiable audit trail. Every health report can be attested on-chain — a tamper-evident record your team and auditors can verify. This is the live feed."}
        </p>

        {stats && (
          <div className="flex justify-center gap-6 pt-2">
            <div>
              <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Total Mints</div>
            </div>
            {!schemaFilter && (
              <div>
                <div className="text-2xl font-bold tabular-nums">{Object.keys(stats.bySchema).length}</div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Active Schemas</div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {schemaFilter ? "Recent Attestations" : "Recent Mints"}
            </h2>
            {schemaFilter && (
              <Link href="/onchain" className="text-[10px] text-[var(--accent)] hover:underline">
                View all schemas
              </Link>
            )}
          </div>

          {error && (
            <div className="p-4 bg-[var(--danger)]/10 text-[var(--danger)] rounded-xl text-sm border border-[var(--danger)]/20">
              Error: {error}
            </div>
          )}

          {stats?.recent.length === 0 ? (
            <div className="p-12 text-center bg-[var(--surface)] border border-[var(--border)] rounded-2xl border-dashed">
              <p className="text-[var(--text-muted)] mb-4">No mints found yet.</p>
              <Link href="/" className="bg-[var(--accent)] text-[var(--bg)] px-6 py-2 rounded-lg text-sm font-medium">
                Be the first to mint
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {stats?.recent.map((record) => (
                <div 
                  key={record.txSignature} 
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--accent)]/50 transition-colors group animate-slide-up"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Link 
                          href={`/onchain?schema=${encodeURIComponent(record.schemaName)}`}
                          className="text-lg font-bold hover:text-[var(--accent)] transition-colors truncate"
                        >
                          {record.schemaName}
                        </Link>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          record.healthScore >= 90 ? "bg-[var(--success)]/10 text-[var(--success)]"
                          : record.healthScore >= 70 ? "bg-yellow-500/10 text-yellow-400"
                          : "bg-[var(--danger)]/10 text-[var(--danger)]"
                        }`}>
                          {record.healthScore}% Healthy
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                        Author: {record.walletAddress}
                      </p>
                    </div>
                    <Link 
                      href={`/episode/${record.episodeId}`}
                      className="shrink-0 bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors"
                    >
                      View Report
                    </Link>
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 mt-3">
                    <div className="flex gap-4">
                      <div>
                        <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Network</div>
                        <div className="text-[10px] font-medium">{record.network}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Attestation Hash</div>
                        <div className="text-[10px] font-mono" title={record.reportHash}>
                          {record.reportHash ? `${record.reportHash.slice(0, 8)}…` : "N/A"}
                        </div>
                      </div>
                    </div>
                    <a 
                      href={record.network === "mainnet-beta" 
                        ? `https://explorer.solana.com/tx/${record.txSignature}` 
                        : `https://explorer.solana.com/tx/${record.txSignature}?cluster=${record.network}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1"
                    >
                      <span>{new Date(record.createdAt).toLocaleDateString()}</span>
                      <span className="opacity-50">↗</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Leaderboard / Sidebar */}
        {!schemaFilter && (
          <div className="space-y-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Trending Schemas
            </h2>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              {Object.entries(stats?.bySchema || {})
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([name, count], i) => (
                  <Link 
                    key={name} 
                    href={`/onchain?schema=${encodeURIComponent(name)}`}
                    className="flex items-center justify-between p-4 hover:bg-[var(--bg)] border-b border-[var(--border)] last:border-0 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-[var(--text-muted)] w-4 tabular-nums">
                        {i + 1}.
                      </span>
                      <span className="text-sm font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                        {name.split(".").pop()}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full">
                      {count}×
                    </span>
                  </Link>
                ))}
            </div>

            <div className="bg-[var(--accent)]/5 border border-[var(--accent)]/20 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold">Onchain Primitives</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--text)]">🔐 Attestation</p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-0.5">
                    Each health report is hashed and anchored on Solana via the Memo program. The hash proves the report existed at a specific time with a specific score.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--text)]">✅ Verification</p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-0.5">
                    Anyone can verify a report by comparing the on-chain hash against the current report. Mismatch = tampering detected.
                  </p>
                  <Link href="/verify" className="text-[10px] text-[var(--accent)] hover:underline mt-1 inline-block">
                    Verify an attestation →
                  </Link>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--text)]">📜 Audit Trail</p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-0.5">
                    Multiple attestations over time create a permanent health history — auditors can track improvements and regressions without trusting DataBard's servers.
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-[var(--accent)]/20">
                <p className="text-[10px] text-[var(--text-muted)]">
                  Powered by Solana Memo Program · No smart contracts · No gas for verification
                </p>
              </div>
            </div>
          </div>
        )}
        
        {schemaFilter && (
           <div className="space-y-6">
             <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
               Schema Stats
             </h2>
             <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
               <div>
                 <div className="text-xs text-[var(--text-muted)] mb-1">Total Attestations</div>
                 <div className="text-3xl font-bold">{stats?.total}</div>
               </div>
               {stats?.recent[0] && (
                 <div>
                   <div className="text-xs text-[var(--text-muted)] mb-1">Latest Health</div>
                   <div className={`text-xl font-bold ${
                     stats.recent[0].healthScore >= 90 ? "text-[var(--success)]" : "text-yellow-400"
                   }`}>
                     {stats.recent[0].healthScore}%
                   </div>
                 </div>
               )}
               <Link 
                href="/" 
                className="block w-full text-center bg-[var(--accent)] text-[var(--bg)] py-3 rounded-xl text-sm font-bold hover:brightness-110 transition ease-out"
               >
                 Mint New Snapshot
               </Link>
             </div>
           </div>
        )}
      </div>
    </>
  );
}

export default function OnChainWall() {
  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-8">
      <Suspense fallback={
        <div className="flex flex-col items-center gap-4 py-20">
          <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-muted)]">Loading health wall…</p>
        </div>
      }>
        <OnChainWallContent />
      </Suspense>

      <footer className="text-[10px] text-[var(--text-muted)] pt-8 pb-4 flex gap-3">
        <Link href="/leaderboard" className="hover:text-[var(--text)] transition-colors">🏆 Leaderboard</Link>
        <span>·</span>
        <Link href="/protocol" className="hover:text-[var(--text)] transition-colors">📡 Protocol dashboard</Link>
        <span>·</span>
        <span>Powered by Solana Memo Program · {new Date().getFullYear()} DataBard</span>
      </footer>
    </main>
  );
}
