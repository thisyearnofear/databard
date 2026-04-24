"use client";

import { WalletConnect } from "@/components/WalletConnect";
import { WalletProviderBoundary } from "@/components/pro/WalletProviderBoundary";

interface ProWalletIslandProps {
  initiaAddress: string | null;
  onAddressChange: (address: string | null) => void;
  onSessionChange: (session: unknown) => void;
}

const walletFallback = (
  <div className="text-xs text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
    🔗 Wallet temporarily unavailable — continue in Pro with your Stripe customer ID.
  </div>
);

export function ProWalletIsland({ initiaAddress, onAddressChange, onSessionChange }: ProWalletIslandProps) {
  return (
    <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Initia Wallet</h2>
        {initiaAddress && <span className="text-xs text-[var(--success)]">Connected</span>}
      </div>
      <p className="text-xs text-[var(--text-muted)]">Connect your .init wallet to authenticate with DataBard Pro on the Initia network.</p>

      <WalletProviderBoundary fallback={walletFallback}>
        <WalletConnect onAddressChange={onAddressChange} onSessionChange={onSessionChange} />
      </WalletProviderBoundary>

      {initiaAddress && (
        <p className="text-xs text-[var(--text-muted)]">
          Episodes generated while connected will be recorded on-chain with your .init identity.
        </p>
      )}
    </div>
  );
}
