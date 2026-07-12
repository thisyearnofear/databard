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
      <div className="absolute inset-0 flex items-center justify-center px-4 bg-gradient-to-b from-transparent to-[var(--bg)]">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center max-w-sm shadow-lg">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-base font-semibold mb-2">Your episodes, permanently yours</p>
          <p className="text-sm text-[var(--text-muted)] mb-5">
            Every episode you mint is anchored on Solana and stored on IPFS — portable, provable,
            and tied to your wallet forever.
          </p>
          <button
            onClick={() => setVisible(true)}
            className="w-full bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-5 py-2.5 text-sm font-medium cursor-pointer transition ease-out"
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
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-5 py-10">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-[var(--accent)] text-sm no-underline">← Back to DataBard</Link>
          <h1 className="text-[28px] font-bold mt-3 mb-1">📼 Episode History</h1>
          <p className="text-[var(--text-muted)] text-[15px]">
            Your past episodes — permanently stored on IPFS via Grove, anchored on Solana.
          </p>
        </div>

        {/* Wallet gate */}
        {!publicKey && <WalletGate />}

        {/* Loading */}
        {publicKey && loading && (
          <div className="text-center p-12 text-[var(--text-muted)]">
            <div className="text-[32px] mb-3">⏳</div>
            Loading your episode history…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-lg p-4 text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {/* Empty state */}
        {publicKey && !loading && !error && records.length === 0 && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
            <div className="text-[40px] mb-3">🎙️</div>
            <p className="text-base font-semibold mb-2">No episodes minted yet</p>
            <p className="text-[var(--text-muted)] text-sm mb-5">
              Generate an episode and mint it on Solana — it will appear here permanently.
            </p>
            <Link
              href="/"
              className="inline-block bg-[var(--accent)] text-[var(--bg)] px-5 py-2.5 rounded-lg text-sm font-semibold no-underline"
            >
              Generate an episode →
            </Link>
          </div>
        )}

        {/* Records list */}
        {records.length > 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-muted)] text-[13px] mb-1">
              {records.length} episode{records.length !== 1 ? "s" : ""} found
            </p>
            {records.map((r, i) => (
              <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
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
                      className="text-xs px-3 py-1 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] no-underline font-semibold"
                    >
                      🎙️ View Episode
                    </Link>
                  )}
                  {r.groveMetadataUrl && (
                    <a
                      href={r.groveMetadataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] no-underline font-semibold"
                    >
                      🌿 Grove Metadata
                    </a>
                  )}
                  {r.groveAudioUrl && (
                    <a
                      href={r.groveAudioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] no-underline font-semibold"
                    >
                      🎵 Grove Audio
                    </a>
                  )}
                  <a
                    href={explorerUrl(r.txSignature, r.network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1 rounded-md bg-[var(--bg)] text-[var(--text-muted)] no-underline"
                  >
                    ◎ Solana Explorer
                  </a>
                </div>

                {/* Grove CID */}
                {r.groveCid && (
                  <div className="mt-2.5 text-[11px] text-[var(--text-muted)] font-mono break-all">
                    IPFS: {r.groveCid}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-[var(--border)] flex gap-5 text-[13px] text-[var(--text-muted)]">
          <Link href="/leaderboard" className="text-[var(--text-muted)] no-underline">🏆 Leaderboard</Link>
          <Link href="/" className="text-[var(--text-muted)] no-underline">← Home</Link>
        </div>
      </div>
    </main>
  );
}
