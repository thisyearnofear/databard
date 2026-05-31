"use client";

import dynamic from "next/dynamic";
import { WalletProviderBoundary } from "@/components/pro/WalletProviderBoundary";

const WalletConnect = dynamic(
  () => import("@/components/WalletConnect").then((m) => ({ default: m.WalletConnect })),
  { ssr: false }
);

interface ProWalletIslandProps {
  walletAddress: string | null;
  onAddressChange: (address: string | null) => void;
  onSessionChange: (session: unknown) => void;
}

const walletFallback = (
  <div className="text-xs text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
    🔗 Wallet sign-in is temporarily unavailable right now. You can still sign in with Email or Stripe below.
  </div>
);

export function ProWalletIsland({ walletAddress, onAddressChange, onSessionChange }: ProWalletIslandProps) {
  return (
    <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Wallet Sign-in</h2>
        {walletAddress ? (
          <span className="text-xs text-[var(--success)]">Signed in</span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">Not connected</span>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)]">Connect your wallet to sign in and unlock onchain Pro entitlements.</p>
      <p className="text-xs text-[var(--text-muted)]">Data used: public wallet address + signed session proof for authentication.</p>

      <WalletProviderBoundary fallback={walletFallback}>
        <WalletConnect onAddressChange={onAddressChange} onSessionChange={onSessionChange} />
      </WalletProviderBoundary>

      {walletAddress && (
        <p className="text-xs text-[var(--text-muted)]">
          Episodes generated while connected will be recorded on-chain with your wallet identity.
        </p>
      )}
    </div>
  );
}
