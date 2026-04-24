"use client";

/**
 * WalletConnect — Initia wallet connection button for the Pro page.
 * Uses InterwovenKit's useInterwovenKit hook to connect a .init wallet.
 * Gracefully degrades if InterwovenKit is not installed.
 */
import { useState, useEffect } from "react";
import { useInitiaWalletReady } from "@/components/InitiaProvider";

type InterwovenKitHook = {
  initiaAddress?: string;
  openConnect: () => void;
};

interface WalletConnectProps {
  onAddressChange?: (address: string | null) => void;
}

function WalletConnectInner({ onAddressChange, useInterwovenKit }: WalletConnectProps & { useInterwovenKit: () => InterwovenKitHook }) {
  const { initiaAddress, openConnect } = useInterwovenKit();

  useEffect(() => {
    onAddressChange?.(initiaAddress ?? null);
  }, [initiaAddress, onAddressChange]);

  if (!initiaAddress) {
    return (
      <button
        onClick={openConnect}
        className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer flex items-center justify-center gap-2"
      >
        <span>🔗</span> Connect Initia Wallet (.init)
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2">
      <span className="text-xs text-[var(--success)]">●</span>
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-[var(--text-muted)]">Connected wallet</span>
        <span className="text-sm font-mono truncate">{initiaAddress}</span>
      </div>
      <button
        onClick={openConnect}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0"
      >
        Switch
      </button>
    </div>
  );
}

export function WalletConnect({ onAddressChange }: WalletConnectProps) {
  const [mounted, setMounted] = useState(false);
  const [useInterwovenKit, setUseInterwovenKit] = useState<(() => InterwovenKitHook) | null>(null);
  const walletReady = useInitiaWalletReady();
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !walletReady) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("@initia/interwovenkit-react");
      setUseInterwovenKit(() => mod.useInterwovenKit ?? null);
    } catch {
      setUseInterwovenKit(null);
    }
  }, [mounted, walletReady]);

  if (!mounted || !walletReady || !useInterwovenKit) {
    return (
      <div className="text-xs text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
        🔗 Initia wallet connection coming soon — authenticate with your .init username as an alternative to Stripe
      </div>
    );
  }

  return <WalletConnectInner onAddressChange={onAddressChange} useInterwovenKit={useInterwovenKit} />;
}
