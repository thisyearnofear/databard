"use client";

/**
 * SolanaFeatures — lazy-loaded wrapper for all Solana-specific UI:
 * wallet connect, Palm USD checkout, minting buttons.
 * Dynamically imported so the Web3 bundle stays off the critical path
 * for enterprise/data-team users.
 */

import { useWallet } from "@solana/wallet-adapter-react";
import { SolanaWalletConnect } from "@/components/SolanaWalletConnect";
import { PalmUsdCheckout } from "@/components/PalmUsdCheckout";

interface SolanaFeaturesProps {
  mode: "connect" | "mint" | "pro-checkout";
  onAddressChange?: (address: string | null) => void;
  onSolDomainChange?: (domain: string | null) => void;
  onMint?: () => void;
  minting?: boolean;
}

export default function SolanaFeatures({
  mode,
  onAddressChange,
  onSolDomainChange,
  onMint,
  minting,
}: SolanaFeaturesProps) {
  const { publicKey } = useWallet();

  if (mode === "connect") {
    return (
      <div className="bg-[var(--surface)] border border-[var(--accent)]/30 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-sm font-medium text-center">Connect your Solana wallet to mint episodes on-chain</p>
        <SolanaWalletConnect onAddressChange={onAddressChange} onSolDomainChange={onSolDomainChange} />
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-xs text-[var(--text-muted)]">or connect a data source below</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>
      </div>
    );
  }

  if (mode === "mint") {
    return (
      <div className="mb-3">
        <SolanaWalletConnect onAddressChange={onAddressChange} onSolDomainChange={onSolDomainChange} />
        {publicKey && onMint && (
          <button
            onClick={onMint}
            disabled={minting}
            className="mt-2 w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-6 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            {minting ? "Minting…" : "Mint on Solana"}
          </button>
        )}
      </div>
    );
  }

  if (mode === "pro-checkout") {
    return <PalmUsdCheckout compact />;
  }

  return null;
}
