"use client";

/**
 * Persistent header wallet button — the standard Solana dApp convention
 * (Phantom/Jupiter/Tensor: an always-visible "Connect Wallet" pill, not a
 * button buried inside a flow-specific card). Reuses the wallet-adapter
 * context already mounted globally in ClientProviders, so this costs no
 * extra bundle weight beyond what the app already loads on every page.
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { resolveSolDomain } from "@/lib/sns";

export function WalletButton() {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [solDomain, setSolDomain] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const address = connected && publicKey ? publicKey.toBase58() : null;

  useEffect(() => {
    if (!address) { setSolDomain(null); return; }
    let cancelled = false;
    resolveSolDomain(address).then((d) => { if (!cancelled) setSolDomain(d); });
    return () => { cancelled = true; };
  }, [address]);

  // Close the dropdown on any outside click (same idiom as EpisodePlayer's share menu)
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close, { once: true });
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  if (!address) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="h-8 px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-medium hover:border-[var(--accent)] transition-colors cursor-pointer flex items-center gap-1.5"
      >
        <span>👛</span>
        <span className="hidden sm:inline">Connect Wallet</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        className="h-8 px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-medium hover:border-[var(--accent)] transition-colors cursor-pointer flex items-center gap-1.5"
        title={address}
      >
        <span className="text-[var(--success)]">●</span>
        <span className="font-mono">{solDomain ?? `${address.slice(0, 4)}…${address.slice(-4)}`}</span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-9 w-40 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg py-1 text-xs z-50">
          <button
            onClick={() => { navigator.clipboard.writeText(address); setMenuOpen(false); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg)] cursor-pointer"
          >
            Copy address
          </button>
          <button
            onClick={() => { disconnect(); setMenuOpen(false); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg)] text-[var(--danger)] cursor-pointer"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
