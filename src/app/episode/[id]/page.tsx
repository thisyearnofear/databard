"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import { SolanaWalletConnect } from "@/components/SolanaWalletConnect";
import type { Episode } from "@/lib/types";

export default function SharedEpisode() {
  const params = useParams();
  const id = params.id as string;
  const { publicKey } = useWallet();

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  // Gated access state
  const [isMinted, setIsMinted] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);

  useEffect(() => {
    async function loadEpisode() {
      try {
        const res = await fetch(`/api/share?id=${id}`);
        const data = await res.json();

        if (data.ok) {
          const ep = data.episode;
          if (data.expiresIn != null) setExpiresIn(data.expiresIn);

          // Reconstruct audio from base64 if available
          if (ep.audioBase64) {
            const bytes = Uint8Array.from(atob(ep.audioBase64), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: "audio/mpeg" });
            setAudioUrl(URL.createObjectURL(blob));
          }

          setEpisode(ep);
        } else {
          setError(data.error);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load episode");
      } finally {
        setLoading(false);
      }
    }

    loadEpisode();
  }, [id]);

  // Check wallet ownership whenever wallet connects
  useEffect(() => {
    if (!publicKey || !episode) return;
    setCheckingAccess(true);
    fetch(`/api/onchain/access?walletAddress=${publicKey.toBase58()}&episodeId=${id}`)
      .then((r) => r.json())
      .then((d) => { setIsMinted(d.hasAccess === true); setAccessChecked(true); })
      .catch(() => setAccessChecked(true))
      .finally(() => setCheckingAccess(false));
  }, [publicKey, episode, id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading episode…</p>
      </main>
    );
  }

  if (error || !episode || !audioUrl) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-[var(--danger)]">{error || "Episode not found or expired"}</p>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 max-w-sm text-center">
          <p className="text-sm mb-3">Shared episodes expire after 24 hours. Want to hear what DataBard sounds like?</p>
          <a href="/" className="inline-block bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium">
            ▶ Listen to a demo
          </a>
        </div>
      </main>
    );
  }

  const walletConnected = !!publicKey;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
      {/* Expiry banner */}
      <div className="text-xs text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5">
        ⏳ {expiresIn != null
          ? expiresIn > 3600
            ? `Expires in ${Math.round(expiresIn / 3600)}h`
            : expiresIn > 60
            ? `Expires in ${Math.round(expiresIn / 60)}m`
            : "Expiring soon"
          : "Shared episodes expire 24 hours after creation"}
      </div>

      {/* On-chain ownership badge */}
      {walletConnected && accessChecked && !checkingAccess && (
        <div
          className="text-xs px-3 py-1.5 rounded-lg border"
          style={
            isMinted
              ? { background: "rgba(91,245,140,0.08)", borderColor: "var(--success)", color: "var(--success)" }
              : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }
          }
        >
          {isMinted
            ? "✓ You minted this episode — on-chain record verified"
            : "ℹ This episode hasn't been minted by your wallet"}
        </div>
      )}

      <EpisodePlayer episode={episode} audioUrl={audioUrl} />

      {/* Wallet connect nudge for non-connected visitors */}
      {!walletConnected && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 max-w-md text-center">
          <p className="text-xs text-[var(--text-muted)] mb-2">
            🔗 Connect your Solana wallet to verify on-chain ownership and see team history
          </p>
          <SolanaWalletConnect />
        </div>
      )}

      {/* CTA for shared episode visitors */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 max-w-md text-center">
        <p className="text-sm font-medium mb-1">🎙️ This episode was made with DataBard</p>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Turn any data catalog into a podcast — flag quality issues, trace lineage, and keep your team informed.
        </p>
        <div className="flex gap-2 justify-center">
          <a href="/" className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-xs font-medium">
            Generate your own
          </a>
          <a href="/leaderboard" className="bg-[var(--border)] hover:bg-[var(--text-muted)]/20 rounded-lg px-4 py-2 text-xs font-medium">
            🏆 Leaderboard
          </a>
        </div>
      </div>
    </main>
  );
}
