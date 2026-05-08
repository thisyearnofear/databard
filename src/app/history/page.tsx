"use client";
/**
 * /history — Wallet-connected episode history page.
 * Shows all past episodes minted by the connected wallet, with Grove/IPFS
 * links to retrieve the full episode metadata and audio.
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

interface HistoryRecord {
  schemaName: string;
  healthScore: number;
  episodeId: string;
  txSignature: string;
  network: string;
  createdAt: string;
  groveCid: string | null;
  groveMetadataUrl: string | null;
  groveAudioUrl: string | null;
  solDomain: string | null;
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color, minWidth: 36 }}>{score}%</span>
    </div>
  );
}

export default function HistoryPage() {
  const { publicKey } = useWallet();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) { setRecords([]); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/onchain/history?wallet=${publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setRecords(data.records);
        else setError(data.error || "Failed to load history");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [publicKey]);

  const explorerUrl = (sig: string, network: string) =>
    network === "mainnet-beta"
      ? `https://explorer.solana.com/tx/${sig}`
      : `https://explorer.solana.com/tx/${sig}?cluster=${network}`;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)", fontFamily: "var(--font-sans, sans-serif)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <Link href="/" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 14 }}>← Back to DataBard</Link>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "12px 0 4px" }}>📼 Episode History</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, margin: 0 }}>
            Your past episodes — permanently stored on IPFS via Grove, anchored on Solana.
          </p>
        </div>

        {/* Wallet gate */}
        {!publicKey && (
          <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Connect your Solana wallet</p>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, margin: 0 }}>
              Your episode history is tied to your wallet address. Connect Phantom to view your past episodes.
            </p>
          </div>
        )}

        {/* Loading */}
        {publicKey && loading && (
          <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,0.4)" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            Loading your episode history…
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 16, color: "#ef4444", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {publicKey && !loading && !error && records.length === 0 && (
          <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎙️</div>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No episodes minted yet</p>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 20 }}>
              Generate an episode and mint it on Solana — it will appear here permanently.
            </p>
            <Link href="/" style={{ background: "var(--accent)", color: "#fff", padding: "10px 20px", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
              Generate an episode →
            </Link>
          </div>
        )}

        {/* Records list */}
        {records.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "0 0 4px" }}>
              {records.length} episode{records.length !== 1 ? "s" : ""} found
            </p>
            {records.map((r, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
                {/* Title row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{r.schemaName}</div>
                    {r.solDomain && (
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>🌐 {r.solDomain}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>
                    {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>

                {/* Health bar */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Health Score</div>
                  <HealthBar score={r.healthScore} />
                </div>

                {/* Links */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {r.episodeId && (
                    <Link
                      href={`/episode/${r.episodeId}`}
                      style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "rgba(var(--accent-rgb,99,102,241),0.15)", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
                    >
                      🎙️ View Episode
                    </Link>
                  )}
                  {r.groveMetadataUrl && (
                    <a
                      href={r.groveMetadataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "rgba(139,92,246,0.15)", color: "#a78bfa", textDecoration: "none", fontWeight: 600 }}
                    >
                      🌿 Grove Metadata
                    </a>
                  )}
                  {r.groveAudioUrl && (
                    <a
                      href={r.groveAudioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "rgba(139,92,246,0.15)", color: "#a78bfa", textDecoration: "none", fontWeight: 600 }}
                    >
                      🎵 Grove Audio
                    </a>
                  )}
                  <a
                    href={explorerUrl(r.txSignature, r.network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
                  >
                    ◎ Solana Explorer
                  </a>
                </div>

                {/* Grove CID */}
                {r.groveCid && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "monospace", wordBreak: "break-all" }}>
                    IPFS: {r.groveCid}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 20, fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
          <Link href="/leaderboard" style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>🏆 Leaderboard</Link>
          <Link href="/" style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>← Home</Link>
        </div>
      </div>
    </main>
  );
}
