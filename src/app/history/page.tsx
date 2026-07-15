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
    <div className="flex flex-col items-center text-center py-16">
      <div className="text-5xl mb-4 opacity-60">🔗</div>
      <h2 className="text-xl font-semibold mb-2">Your episodes, permanently yours</h2>
      <p className="text-sm text-[var(--text-muted)] max-w-sm mb-6 leading-relaxed">
        Every episode you mint is anchored on Solana and stored on IPFS — portable, provable, and tied to your wallet forever.
      </p>
      <button
        onClick={() => setVisible(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] px-6 py-3 text-sm font-semibold cursor-pointer transition-[transform,filter] duration-200 ease-out hover:scale-[1.02] active:scale-[0.97] shadow-lg shadow-[var(--accent)]/20"
      >
        <span>👛</span>
        <span>Connect Wallet</span>
      </button>
      {totalMinted !== null && totalMinted > 0 && (
        <p className="text-xs text-[var(--text-muted)] mt-5">
          🎧 {totalMinted.toLocaleString()} episode{totalMinted !== 1 ? "s" : ""} recorded on-chain so far
        </p>
      )}
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
    <main className="enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-5 py-10 sm:py-16">
      <div className="max-w-2xl mx-auto">
        {/* Header — minimal, no back link (nav handles that) */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold mb-2">Episode History</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Your past episodes — stored on IPFS, anchored on Solana.
          </p>
        </div>

        {/* Wallet gate — centered, no card */}
        {!publicKey && <WalletGate />}

        {/* Loading */}
        {publicKey && loading && (
          <div className="flex flex-col items-center text-center py-16 text-[var(--text-muted)]">
            <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">Loading your episode history…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-lg p-4 text-[var(--danger)] text-sm text-center">
            {error}
          </div>
        )}

        {/* Empty state — minimal, no card */}
        {publicKey && !loading && !error && records.length === 0 && (
          <div className="flex flex-col items-center text-center py-16">
            <div className="text-5xl mb-4 opacity-60">🎙️</div>
            <h2 className="text-lg font-semibold mb-2">No episodes yet</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-sm mb-6">
              Generate an episode and mint it on Solana — it will appear here permanently.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] px-6 py-3 text-sm font-semibold no-underline transition-[transform,filter] duration-200 ease-out hover:scale-[1.02] active:scale-[0.97]"
            >
              Generate an episode →
            </Link>
          </div>
        )}

        {/* Records list */}
        {records.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[var(--text-muted)] text-xs mb-1">
              {records.length} episode{records.length !== 1 ? "s" : ""} found
            </p>
            {records.map((r, i) => (
              <div key={i} className="hover-depth bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 transition-[transform,box-shadow] duration-200 ease-out">
                {/* Title row */}
                <div className="flex justify-between items-start gap-3 mb-3">
                  <div>
                    <div className="font-bold text-base">{r.schemaName}</div>
                    {r.solDomain && (
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">🌐 {r.solDomain}</div>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>

                {/* Health bar */}
                <div className="mb-3.5">
                  <div className="text-xs text-[var(--text-muted)] mb-1">Health Score</div>
                  <HealthBar score={r.healthScore} />
                </div>

                {/* Links */}
                <div className="flex flex-wrap gap-2">
                  {r.episodeId && (
                    <Link
                      href={`/episode/${r.episodeId}`}
                      className="text-xs px-3 py-2.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] no-underline font-semibold"
                    >
                      🎙️ View Episode
                    </Link>
                  )}
                  {r.groveMetadataUrl && (
                    <a
                      href={r.groveMetadataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-2.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] no-underline font-semibold"
                    >
                      🌿 Grove Metadata
                    </a>
                  )}
                  {r.groveAudioUrl && (
                    <a
                      href={r.groveAudioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-2.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] no-underline font-semibold"
                    >
                      🎵 Grove Audio
                    </a>
                  )}
                  <a
                    href={explorerUrl(r.txSignature, r.network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-2.5 rounded-md bg-[var(--bg)] text-[var(--text-muted)] no-underline"
                  >
                    ◎ Solana Explorer
                  </a>
                </div>

                {/* Grove CID */}
                {r.groveCid && (
                  <div className="mt-2.5 text-xs text-[var(--text-muted)] font-mono break-all">
                    IPFS: {r.groveCid}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
