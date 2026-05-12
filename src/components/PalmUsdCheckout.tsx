"use client";

/**
 * PalmUsdCheckout — polished payment flow for DataBard Pro via Palm USD (Solana).
 *
 * States: idle → connecting → ready → signing → confirming → success | error
 * Designed to match Palm USD brand (green) while fitting DataBard's design system.
 */
import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";

type CheckoutState = "idle" | "ready" | "signing" | "confirming" | "success" | "error";

interface PalmUsdCheckoutProps {
  /** Called after successful payment activation */
  onSuccess?: (txSignature: string) => void;
  /** Compact mode for inline use (e.g., pricing cards) */
  compact?: boolean;
}

export function PalmUsdCheckout({ onSuccess, compact = false }: PalmUsdCheckoutProps) {
  const { publicKey, connected, signTransaction, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [state, setState] = useState<CheckoutState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
    setTxSignature(null);
    setExplorerUrl(null);
  }, []);

  const handleCheckout = useCallback(async () => {
    if (!publicKey || !signTransaction) return;

    setError(null);
    setState("signing");

    try {
      // 1. Request unsigned transaction from server
      const res = await fetch("/api/checkout/palmusd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to prepare payment");
      }

      // 2. Sign with wallet
      const tx = Transaction.from(Buffer.from(data.unsignedTxBase64, "base64"));
      const signedTx = await signTransaction(tx);

      setState("confirming");

      // 3. Submit signed transaction
      const { Connection } = await import("@solana/web3.js");
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      // 4. Wait for confirmation
      await connection.confirmTransaction(signature, "confirmed");

      // 5. Verify payment and activate Pro
      const verifyRes = await fetch("/api/checkout/palmusd/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          txSignature: signature,
        }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.ok) {
        throw new Error(verifyData.error || "Payment verification failed");
      }

      setTxSignature(signature);
      setExplorerUrl(verifyData.explorerUrl);
      setState("success");
      onSuccess?.(signature);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      // User rejected in wallet — don't show as error, just reset
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        setState(connected ? "ready" : "idle");
        return;
      }
      setError(msg);
      setState("error");
    }
  }, [publicKey, signTransaction, connected, onSuccess]);

  // Update state when wallet connects/disconnects
  const effectiveState = connected && publicKey
    ? state === "idle" ? "ready" : state
    : "idle";

  // ─── Success state ───
  if (effectiveState === "success") {
    return (
      <div className={`flex flex-col items-center gap-3 ${compact ? "py-3" : "py-5"}`}>
        <div className="animate-check-pop w-12 h-12 rounded-full bg-[var(--success)]/10 border-2 border-[var(--success)] flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--success)]">Pro activated</p>
        <p className="text-xs text-[var(--text-muted)] text-center">
          Paid 29 PUSD via Palm USD on Solana
        </p>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--palm)] hover:underline flex items-center gap-1"
          >
            <span>View transaction</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
        <a
          href="/pro"
          className="mt-1 text-xs text-[var(--accent)] hover:underline"
        >
          Go to Pro settings →
        </a>
      </div>
    );
  }

  // ─── Error state ───
  if (effectiveState === "error") {
    return (
      <div className={`flex flex-col items-center gap-3 ${compact ? "py-3" : "py-4"}`}>
        <div className="w-10 h-10 rounded-full bg-[var(--danger)]/10 border border-[var(--danger)]/30 flex items-center justify-center">
          <span className="text-lg">✗</span>
        </div>
        <p className="text-sm text-[var(--danger)] text-center max-w-xs">{error}</p>
        <button
          onClick={reset}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  // ─── Processing states (signing / confirming) ───
  if (effectiveState === "signing" || effectiveState === "confirming") {
    return (
      <div className={`flex flex-col items-center gap-3 ${compact ? "py-3" : "py-5"}`}>
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--palm)]/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--palm)] animate-spin" />
        </div>
        <p className="text-sm text-[var(--text)]">
          {effectiveState === "signing" ? "Approve in wallet…" : "Confirming on-chain…"}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {effectiveState === "signing"
            ? "Sign the 29 PUSD transfer in your wallet"
            : "Waiting for Solana network confirmation"
          }
        </p>
      </div>
    );
  }

  // ─── Ready state (wallet connected) ───
  if (effectiveState === "ready") {
    return (
      <div className={`flex flex-col gap-3 ${compact ? "" : "py-2"}`}>
        {/* Wallet info */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-muted)] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
            {wallet?.adapter.name} · {publicKey?.toBase58().slice(0, 4)}…{publicKey?.toBase58().slice(-4)}
          </span>
          <span className="text-[var(--text-muted)]">29 PUSD</span>
        </div>

        {/* Pay button */}
        <button
          onClick={handleCheckout}
          className="w-full relative overflow-hidden rounded-lg px-5 py-3 text-sm font-semibold text-white cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg"
          style={{
            background: "linear-gradient(135deg, var(--palm), var(--palm-light))",
            boxShadow: "0 4px 20px var(--palm-glow), 0 1px 3px rgba(0,0,0,0.2)",
          }}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            <PalmIcon size={16} />
            Pay 29 PUSD
          </span>
        </button>

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-3 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Non-freezable
          </span>
          <span>·</span>
          <span>1:1 USD backed</span>
          <span>·</span>
          <span>Solana SPL</span>
        </div>
      </div>
    );
  }

  // ─── Idle state (no wallet connected) ───
  return (
    <div className={`flex flex-col gap-3 ${compact ? "" : "py-2"}`}>
      <button
        onClick={() => setVisible(true)}
        className="w-full relative overflow-hidden rounded-lg px-5 py-3 text-sm font-semibold text-white cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg"
        style={{
          background: "linear-gradient(135deg, var(--palm), var(--palm-light))",
          boxShadow: "0 4px 20px var(--palm-glow), 0 1px 3px rgba(0,0,0,0.2)",
        }}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          <PalmIcon size={16} />
          Pay with Palm USD
        </span>
      </button>
      <p className="text-[10px] text-[var(--text-muted)] text-center">
        Connect a Solana wallet to pay 29 PUSD · non-freezable stablecoin
      </p>
    </div>
  );
}

/** Palm USD brand icon (simplified palm tree) */
function PalmIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="white" fillOpacity="0.15" />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">$</text>
    </svg>
  );
}
