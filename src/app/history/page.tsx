"use client";
/**
 * /history — Episode history page.
 *
 * Shows useful public content above the wallet gate (episode count, recent
 * episode previews, an explainer) so non-web3 visitors get value immediately.
 * Connected wallets see their full, owned episode list below the fold.
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { HealthBar } from "@/components/viz";
import { homeHref } from "@/lib/product/workspaces";

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

interface PreviewRecord {
  schemaName: string;
  healthScore: number;
  episodeId: string;
  createdAt: string;
}

/**
 * Public preview section — shown to everyone, no wallet required.
 * Fetches the global episode count and a few recent mints for social proof.
 */
function PublicPreview() {
  const { setVisible } = useWalletModal();
  const [totalMinted, setTotalMinted] = useState<number | null>(null);
  const [recent, setRecent] = useState<PreviewRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/onchain/mints/stats?limit=3")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setTotalMinted(d.total);
          setRecent((d.recent ?? []).slice(0, 3));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      {/* Prominent stat — episode count, above everything else */}
      <div className="text-center">
        {totalMinted !== null && totalMinted > 0 ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/25 px-5 py-2.5">
            <span className="text-lg">🎧</span>
            <span className="text-sm font-semibold text-[var(--accent)]">
              {totalMinted.toLocaleString()} episode{totalMinted !== 1 ? "s" : ""} recorded on-chain so far
            </span>
          </div>
        ) : loaded ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface)] border border-[var(--border)] px-5 py-2.5">
            <span className="text-sm text-[var(--text-muted)]">
              Be the first to mint an episode on-chain
            </span>
          </div>
        ) : null}
      </div>

      {/* "What is this?" explainer */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 text-center">
        <div className="text-3xl mb-3 opacity-70">📚</div>
        <h2 className="text-base font-semibold mb-2">What is this?</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
          Every DataBard briefing can be minted on Solana and stored on IPFS — creating a permanent,
          verifiable record of your data health. Connect your wallet to see your episodes.
        </p>
      </div>

      {/* Recent episode previews — read-only, no wallet actions */}
      {recent.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">
            Recent episodes
          </h3>
          <div className="flex flex-col gap-3">
            {recent.map((r, i) => (
              <div
                key={i}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 opacity-90"
              >
                <div className="flex justify-between items-start gap-3 mb-3">
                  <div className="font-semibold text-sm truncate">{r.schemaName}</div>
                  <div className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)] mb-1">Health Score</div>
                  <HealthBar score={r.healthScore} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wallet gate — framed as a feature, not a wall */}
      <div className="flex flex-col items-center text-center pt-2">
        <h2 className="text-lg font-semibold mb-2">Connect to see your full history</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-sm mb-5 leading-relaxed">
          Your minted episodes are tied to your wallet. Connect to view, replay, and share your
          permanent on-chain record.
        </p>
        <button
          onClick={() => setVisible(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] px-6 py-3 text-sm font-semibold cursor-pointer transition-[transform,filter] duration-200 ease-out hover:scale-[1.02] active:scale-[0.97] shadow-lg shadow-[var(--accent)]/20"
        >
          <span>👛</span>
          <span>Connect Wallet</span>
        </button>
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
    <main className="enter-up min-h-screen bg-[var(--bg)] text-[var(--text)] px-5 py-10 sm:py-16">
      <div className="max-w-2xl mx-auto">
        {/* Header — minimal, no back link (nav handles that) */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold mb-2">Episode History</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Your past episodes — stored on IPFS, anchored on Solana.
          </p>
        </div>

        {/* Public preview — useful content for everyone, above the wallet gate */}
        {!publicKey && <PublicPreview />}

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
              href={homeHref("protocols")}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] px-6 py-3 text-sm font-semibold no-underline transition-[transform,filter] duration-200 ease-out hover:scale-[1.02] active:scale-[0.97]"
            >
              Generate an episode →
            </Link>
          </div>
        )}

        {/* Records list — wallet-gated, below the fold for connected users */}
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
