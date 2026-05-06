"use client";

/**
 * SolanaWalletConnect — connect Phantom/Solflare wallet for on-chain episode minting.
 * Uses @solana/wallet-adapter-react for wallet state.
 */
import { useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

interface SolanaWalletConnectProps {
  onAddressChange?: (address: string | null) => void;
}

export function SolanaWalletConnect({ onAddressChange }: SolanaWalletConnectProps) {
  const { connection } = useConnection();
  const { publicKey, connected, disconnect, connect, wallet, select } = useWallet();
  const { setVisible } = useWalletModal();

  const address = connected && publicKey ? publicKey.toBase58() : null;

  useEffect(() => {
    onAddressChange?.(address);
  }, [address, onAddressChange]);

  if (!wallet) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
      >
        Connect Solana Wallet
      </button>
    );
  }

  if (!connected) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          Wallet: {wallet.adapter.name}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => connect().catch(() => {})}
            className="flex-1 bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          >
            Connect
          </button>
          <button
            onClick={() => select(null)}
            className="bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm cursor-pointer"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">
          {wallet.adapter.name}
        </span>
        <span className="text-xs font-mono text-[var(--accent)]">
          {address?.slice(0, 4)}...{address?.slice(-4)}
        </span>
      </div>
      <button
        onClick={disconnect}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer text-left"
      >
        Disconnect
      </button>
    </div>
  );
}
