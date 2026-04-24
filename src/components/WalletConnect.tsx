"use client";

import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, ConnectButton } from "@rainbow-me/rainbowkit";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { WagmiProvider, useAccount, useSignMessage } from "wagmi";
import { mainnet } from "wagmi/chains";
import "@rainbow-me/rainbowkit/styles.css";

interface WalletConnectProps {
  onAddressChange?: (address: string | null) => void;
  onSessionChange?: (session: unknown) => void;
}

const queryClient = new QueryClient();

const wagmiConfig = getDefaultConfig({
  appName: "DataBard Pro",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "databard-dev",
  chains: [mainnet],
  ssr: false,
});

function WalletConnectInner({ onAddressChange, onSessionChange }: WalletConnectProps) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const walletAddress = useMemo(() => (isConnected ? (address ?? null) : null), [address, isConnected]);

  useEffect(() => {
    onAddressChange?.(walletAddress);
  }, [onAddressChange, walletAddress]);

  async function handleWalletAuth() {
    if (!walletAddress) return;
    setError(null);
    setIsSigning(true);
    try {
      const challengeRes = await fetch("/api/pro/auth/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress }),
      });
      const challengeData = await challengeRes.json();
      if (!challengeData.ok) throw new Error(challengeData.error || "Failed to create challenge");

      const signature = await signMessageAsync({ message: challengeData.message });

      const verifyRes = await fetch("/api/pro/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challengeData.challengeId,
          address: walletAddress,
          signature,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyData.ok) throw new Error(verifyData.error || "Wallet verification failed");
      onSessionChange?.(verifyData.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet authentication failed");
    } finally {
      setIsSigning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ConnectButton />
      {walletAddress && (
        <button
          onClick={handleWalletAuth}
          disabled={isSigning}
          className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-60"
        >
          {isSigning ? "Signing…" : "Sign in with wallet"}
        </button>
      )}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

export function WalletConnect({ onAddressChange, onSessionChange }: WalletConnectProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WalletConnectInner onAddressChange={onAddressChange} onSessionChange={onSessionChange} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
