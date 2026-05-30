"use client";

import { useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWizard } from "./wizard-context";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import { useToast } from "@/components/Toast";

// Lazy-load Solana features
const SolanaFeatures = dynamic(() => import("@/components/SolanaFeatures"), { ssr: false });

export function EpisodeStep() {
  const { state, dispatch, reset } = useWizard();
  const { publicKey: solanaPublicKey, signTransaction: solanaSignTx } = useWallet();
  const { toast } = useToast();
  
  const episode = state.episode;
  
  async function handleCheckout() {
    const res = await fetch("/api/checkout", { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ plan: "team" }) 
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else toast(data.error || "Checkout not available yet", "error");
  }
  
  const handleMintSolana = useCallback(async () => {
    if (!episode || !solanaPublicKey || !solanaSignTx) return;
    dispatch({ type: "SET_MINTING", minting: true });
    dispatch({ type: "SET_STATUS", status: "Minting on Solana…" });
    
    try {
      // 1. Share episode to get an ID
      let episodeId = "";
      const shareRes = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(episode),
      });
      const shareData = await shareRes.json();
      if (shareData.ok) {
        episodeId = shareData.id;
      } else {
        throw new Error(shareData.error || "Failed to prepare episode for minting");
      }
      
      // 2. Compute report hash for tamper-evidence
      const scriptJson = JSON.stringify(episode.script);
      const encoder = new TextEncoder();
      const encodedScript = encoder.encode(scriptJson);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encodedScript as any);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const reportHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      
      // 3. Get unsigned transaction from server
      const healthScore = episode.qualitySummary.total > 0
        ? Math.round((episode.qualitySummary.passed / episode.qualitySummary.total) * 100)
        : 100;
      
      const mintRes = await fetch("/api/onchain/mint-solana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaName: episode.schemaName,
          healthScore,
          episodeId,
          reportHash,
          walletAddress: solanaPublicKey.toBase58(),
          ...(state.solanaSolDomain ? { solDomain: state.solanaSolDomain } : {}),
          ...(state.groveCid ? { groveCid: state.groveCid } : {}),
        }),
      });
      const mintData = await mintRes.json();
      if (!mintData.ok) throw new Error(mintData.error || "Mint failed");
      
      // 4. Sign and submit
      const { Transaction } = await import("@solana/web3.js");
      const tx = Transaction.from(Buffer.from(mintData.unsignedTxBase64, "base64"));
      const signedTx = await solanaSignTx(tx);
      const sig = await fetch("/api/onchain/mint-solana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaName: episode.schemaName,
          healthScore,
          episodeId,
          reportHash,
          walletAddress: solanaPublicKey.toBase58(),
          ...(state.solanaSolDomain ? { solDomain: state.solanaSolDomain } : {}),
          ...(state.groveCid ? { groveCid: state.groveCid } : {}),
          signedTxBase64: Buffer.from(signedTx.serialize()).toString("base64"),
        }),
      });
      const sigData = await sig.json();
      if (sigData.ok) {
        toast(`Minted on Solana! ${sigData.txSignature?.slice(0, 8)}…`, "success");
        dispatch({ type: "SET_STATUS", status: `✓ Minted on Solana! TX: ${sigData.txSignature?.slice(0, 8)}…` });
      } else {
        toast(sigData.error || "Minting failed", "error");
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Solana minting failed", "error");
      dispatch({ type: "SET_STATUS", status: `Error: ${e instanceof Error ? e.message : "Minting failed"}` });
    } finally {
      dispatch({ type: "SET_MINTING", minting: false });
    }
  }, [episode, solanaPublicKey, solanaSignTx, state.solanaSolDomain, state.groveCid, dispatch, toast]);
  
  if (!episode) return null;
  
  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6">
      {/* Demo context banners */}
      {episode.schemaFqn === "analytics.ecommerce" && (
        <div className="w-full max-w-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl px-4 py-3 text-center animate-slide-up">
          <p className="text-xs text-[var(--text-muted)]">
            🎧 Demo episode analyzing a sample <span className="text-[var(--text)]">e-commerce schema</span> — 6 tables, 3 failing tests, PII governance gaps, and stale pipelines
          </p>
        </div>
      )}
      {episode.schemaFqn === "dune.uniswap" && (
        <div className="w-full max-w-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl px-4 py-3 text-center animate-slide-up">
          <p className="text-xs text-[var(--text-muted)]">
            📊 Demo episode analyzing <span className="text-[var(--text)]">Uniswap onchain data</span> via Dune — 6 queries with real column stats, broken whale tracking, and missing documentation
          </p>
        </div>
      )}
      
      <div data-tour="episode-player">
        <EpisodePlayer 
          episode={episode} 
          audioUrl={state.audioUrl} 
          segmentOffsets={state.segmentOffsets}
          audioDuration={state.audioDuration}
          onMint={state.persona === "web3" && solanaPublicKey ? handleMintSolana : undefined}
          minting={state.minting}
        />
      </div>
      
      <div className="flex flex-col items-center gap-3">
        <button 
          onClick={reset} 
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
        >
          ← Generate another
        </button>
        
        {/* Post-experience upsell */}
        {state.persona === "web3" ? (
          <div className="bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-4 max-w-md text-center animate-slide-up">
            <p className="text-sm mb-2">Save this report to the blockchain</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Create a permanent, shareable record of this health report.
            </p>
            <SolanaFeatures 
              mode="mint"
              onAddressChange={(addr) => dispatch({ type: "SET_SOLANA_ADDRESS", address: addr })} 
              onSolDomainChange={(domain) => dispatch({ type: "SET_SOLANA_SOL_DOMAIN", domain })} 
              onMint={handleMintSolana}
              minting={state.minting}
            />
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-4 max-w-md text-center animate-slide-up">
            <p className="text-sm mb-2">Want this for your team every week?</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Scheduled episodes, private feeds, Slack notifications — $29/mo
            </p>
            <button 
              onClick={handleCheckout} 
              className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-xs font-medium cursor-pointer"
            >
              Start Pro trial
            </button>
          </div>
        )}
      </div>
      {state.status && <p className="text-sm text-[var(--text-muted)]">{state.status}</p>}
    </main>
  );
}
