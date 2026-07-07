"use client";
/**
 * /history — Wallet-connected episode history page.
 * Shows all past episodes minted by the connected wallet, with Grove/IPFS
 * links to retrieve the full episode metadata and audio.
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { HealthBar } from "@/components/viz";
import { Skeleton } from "@/components/Skeleton";

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

/** Ghost preview cards behind the wallet gate — signals "your history lives
 * here" instead of a dead end, using the same Skeleton primitive as the
 * rest of the app's loading states. */
function HistoryGhostPreview() {
  return (
    <div className="space-y-4 opacity-50 pointer-events-none select-none" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} variant="card" />
      ))}
    </div>
  );
}

function WalletGate() {
  const { setVisible } = useWalletModal();
  const [totalMinted, setTotalMinted] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/onchain/mints/stats?limit=1")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setTotalMinted(d.total); })
      .catch(() => {});
  }, []);

  return (
    <div className="relative">
      <HistoryGhostPreview />
      <div
        className="absolute inset-0 flex items-center justify-center px-4"
        style={{ background: "linear-gradient(to bottom, transparent, var(--bg) 40%)" }}
      >
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center max-w-sm shadow-lg">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-base font-semibold mb-2">Your episodes, permanently yours</p>
          <p className="text-sm text-[var(--text-muted)] mb-5">
            Every episode you mint is anchored on Solana and stored on IPFS — portable, provable,
            and tied to your wallet forever.
          </p>
          <button
            onClick={() => setVisible(true)}
            className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-5 py-2.5 text-sm font-medium cursor-pointer transition-all"
          >
            👛 Connect Wallet
          </button>
          {totalMinted !== null && totalMinted > 0 && (
            <p className="text-xs text-[var(--text-muted)] mt-4">
              🎧 {totalMinted.toLocaleString()} episode{totalMinted !== 1 ? "s" : ""} recorded on-chain so far
            </p>
          )}
        </div>
      </div>
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
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <Link href="/" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 14 }}>← Back to DataBard</Link>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "12px 0 4px" }}>📼 Episode History</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15, margin: 0 }}>
            Your past episodes — permanently stored on IPFS via Grove, anchored on Solana.
          </p>
        </div>

        {/* Wallet gate */}
        {!publicKey && <WalletGate />}

        {/* Loading */}
        {publicKey && loading && (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            Loading your episode history…
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", borderRadius: 8, padding: 16, color: "var(--danger)", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {publicKey && !loading && !error && records.length === 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎙️</div>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No episodes minted yet</p>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>
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
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 4px" }}>
              {records.length} episode{records.length !== 1 ? "s" : ""} found
            </p>
            {records.map((r, i) => (
              <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                {/* Title row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{r.schemaName}</div>
                    {r.solDomain && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>🌐 {r.solDomain}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>

                {/* Health bar */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Health Score</div>
                  <HealthBar score={r.healthScore} />
                </div>

                {/* Links */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {r.episodeId && (
                    <Link
                      href={`/episode/${r.episodeId}`}
                      style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
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
                    style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "var(--bg)", color: "var(--text-muted)", textDecoration: "none" }}
                  >
                    ◎ Solana Explorer
                  </a>
                </div>

                {/* Grove CID */}
                {r.groveCid && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
                    IPFS: {r.groveCid}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", gap: 20, fontSize: 13, color: "var(--text-muted)" }}>
          <Link href="/leaderboard" style={{ color: "var(--text-muted)", textDecoration: "none" }}>🏆 Leaderboard</Link>
          <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>← Home</Link>
        </div>
      </div>
    </main>
  );
}
