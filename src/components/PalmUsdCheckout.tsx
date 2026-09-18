"use client";

/**
 * PalmUsdCheckout — polished payment flow for DataBard Pro via Palm USD (Solana).
 *
 * States: idle → connecting → ready → signing → confirming → success | error
 * Designed to match Palm USD brand (green) while fitting DataBard's design system.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction, clusterApiUrl } from "@solana/web3.js";
import {
  checkoutStorageKey,
  clearPendingCheckout,
  readPendingCheckout,
  recoverCheckout,
  savePendingCheckout,
  signatureToBase58,
  submitRecoverableCheckout,
  type PendingCheckout,
} from "@/lib/checkout-recovery";
import { explorerUrl } from "@/lib/settlement/verifier";

type CheckoutState = "idle" | "ready" | "signing" | "confirming" | "pending" | "success" | "error";
type PayMethod = "pusd" | "usdc" | "sol";

const METHOD_LABEL: Record<PayMethod, string> = { pusd: "PUSD", usdc: "USDC", sol: "SOL" };

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
  const [explorer, setExplorer] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("sol");
  const [paidLabel, setPaidLabel] = useState<string>("49 PUSD");
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [checking, setChecking] = useState(false);
  const [restored, setRestored] = useState(false);
  const inFlight = useRef(false);

  const walletKey = publicKey?.toBase58() ?? null;
  const walletRef = useRef<string | null>(null);
  walletRef.current = walletKey;
  const storageKey = walletKey ? checkoutStorageKey("pro", walletKey) : null;

  useEffect(() => {
    if (!storageKey) {
      setRestored(true);
      return;
    }
    setRestored(false);
    setPending(null);
    setError(null);
    setTxSignature(null);
    setExplorer(null);
    setPaidLabel("49 PUSD");
    try {
      const saved = readPendingCheckout(window.localStorage, storageKey);
      if (saved) {
        setPending(saved);
        setPaidLabel(saved.amountLabel);
        setState("pending");
      } else {
        setState("idle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saved payment could not be read");
      setState("error");
    } finally {
      setRestored(true);
    }
  }, [storageKey]);

  const markSuccess = useCallback((signature: string, explorerLink?: string) => {
    setTxSignature(signature);
    setExplorer(explorerLink ?? null);
    setPending(null);
    setState("success");
    onSuccess?.(signature);
  }, [onSuccess]);

  const checkPayment = useCallback(async (record: PendingCheckout) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    setError(null);
    const recordKey = checkoutStorageKey("pro", record.walletAddress);
    try {
      const data = await recoverCheckout(record);
      clearPendingCheckout(window.localStorage, recordKey);
      if (walletRef.current === record.walletAddress || walletRef.current === null) {
        setPaidLabel(record.amountLabel);
        markSuccess(record.txSignature, data.explorerUrl as string | undefined);
      }
    } catch (e) {
      if (walletRef.current === record.walletAddress || walletRef.current === null) {
        setError(e instanceof Error ? e.message : "Payment not confirmed yet. Check its status before paying again.");
      }
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [markSuccess]);

  const handleCheckout = useCallback(async () => {
    if (!publicKey || !signTransaction || !storageKey || inFlight.current) return;
    inFlight.current = true;

    setError(null);
    const payWallet = publicKey.toBase58();
    let persisted = false;

    let saved: PendingCheckout | null = null;
    try {
      saved = readPendingCheckout(window.localStorage, storageKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saved payment could not be read");
      setState("error");
      inFlight.current = false;
      return;
    }
    if (saved) {
      setPending(saved);
      setPaidLabel(saved.amountLabel);
      setState("pending");
      inFlight.current = false;
      return;
    }

    setState("signing");

    try {
      // 1. Request unsigned transaction from server in the chosen method
      const res = await fetch("/api/checkout/palmusd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: payWallet, method }),
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to prepare payment");
      }
      const amountLabel =
        method === "sol" && typeof data.lamports === "number"
          ? `${(data.lamports / 1e9).toFixed(9).replace(/\.?0+$/, "")} SOL`
          : `${data.amount} ${METHOD_LABEL[method]}`;
      setPaidLabel(amountLabel);

      // 2. Sign with wallet
      const tx = Transaction.from(Buffer.from(data.unsignedTxBase64, "base64"));
      const signedTx = await signTransaction(tx);

      const sigBytes = signedTx.signature;
      if (!sigBytes) throw new Error("Missing wallet signature");
      const signature = signatureToBase58(sigBytes);

      const record: PendingCheckout = {
        version: 1,
        walletAddress: payWallet,
        purpose: "pro",
        method,
        quoteId: data.quoteId,
        txSignature: signature,
        amountLabel,
        createdAt: new Date().toISOString(),
      };

      setState("confirming");

      let verifyData: { ok: boolean; explorerUrl?: string; error?: string } | null = null;
      await submitRecoverableCheckout(record, {
        save: (p) => {
          savePendingCheckout(window.localStorage, storageKey, p);
          persisted = true;
          setPending(p);
        },
        submit: async () => {
          // 3. Submit signed transaction
          const { Connection } = await import("@solana/web3.js");
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL
            ?? clusterApiUrl((process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet") as "mainnet-beta" | "devnet" | "testnet");
          const connection = new Connection(rpcUrl, "confirmed");
          await connection.sendRawTransaction(signedTx.serialize());
        },
        verify: async (p) => {
          // 5. Verify payment and activate Pro
          verifyData = await recoverCheckout(p) as typeof verifyData;
          if (!verifyData!.ok) throw new Error(verifyData!.error || "Payment verification failed");
        },
      });

      clearPendingCheckout(window.localStorage, storageKey);
      if (walletRef.current === payWallet) {
        markSuccess(signature, verifyData!.explorerUrl);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      // User rejected in wallet — don't show as error, just reset
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        if (!persisted) {
          setState(connected ? "ready" : "idle");
          return;
        }
        setPending(readPendingCheckout(window.localStorage, storageKey));
        setState("pending");
        return;
      }
      if (walletRef.current !== payWallet) return;
      if (persisted) {
        try {
          setPending(readPendingCheckout(window.localStorage, storageKey));
        } catch { }
        setError(msg);
        setState("pending");
        return;
      }
      setError(msg);
      setState("error");
    } finally {
      inFlight.current = false;
    }
  }, [publicKey, signTransaction, connected, method, storageKey, markSuccess]);

  // Update state when wallet connects/disconnects
  const effectiveState = connected && publicKey
    ? state === "idle" ? "ready" : state
    : state === "pending" ? "pending" : "idle";

  // ─── Success state ───
  if (effectiveState === "success") {
    return (
      <div className={`flex flex-col items-center gap-3 ${compact ? "py-3" : "py-5"}`}>
        <div className="animate-check-pop w-12 h-12 rounded-full bg-[var(--success)]/10 border-2 border-[var(--success)] flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--success)]" aria-live="polite">Pro activated</p>
        <p className="text-xs text-[var(--text-muted)] text-center">
          Paid {paidLabel} on Solana
        </p>
        {explorer && (
          <a
            href={explorer}
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

  if (effectiveState === "pending" && pending) {
    const otherWallet = !connected || !publicKey || publicKey.toBase58() !== pending.walletAddress;
    return (
      <div className={`flex flex-col gap-3 ${compact ? "py-3" : "py-4"}`} aria-live="polite">
        <p className="text-xs text-[var(--text)]">
          Payment not confirmed yet. Check its status before paying again.
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {pending.amountLabel} · reference{" "}
          <code className="select-all font-mono text-[11px] break-all">{pending.txSignature}</code>
        </p>
        {otherWallet && (
          <p className="text-xs text-[var(--text-muted)]">
            This payment belongs to {pending.walletAddress.slice(0, 4)}…{pending.walletAddress.slice(-4)}.
          </p>
        )}
        <div className="flex items-center gap-4 flex-wrap">
          <a
            href={explorerUrl("tx", pending.txSignature)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--palm)] hover:underline"
          >
            view transaction →
          </a>
          <button
            onClick={() => checkPayment(pending)}
            disabled={checking}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-white cursor-pointer bg-gradient-to-br from-[var(--palm)] to-[var(--palm-light)] disabled:opacity-50"
          >
            {checking ? "Checking payment…" : "Check payment / activate Pro"}
          </button>
        </div>
        {error && <p className="text-xs text-[var(--danger)]" role="alert">{error}</p>}
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
        <p className="text-sm text-[var(--danger)] text-center max-w-xs" role="alert">{error}</p>
        <button
          onClick={() => {
            try {
              if (storageKey) {
                const saved = readPendingCheckout(window.localStorage, storageKey);
                if (saved) {
                  setPending(saved);
                  setPaidLabel(saved.amountLabel);
                  setState("pending");
                  return;
                }
              }
              setError(null);
              setPending(null);
              setState("idle");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Saved payment could not be read");
            }
          }}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
        >
          Check saved payment
        </button>
      </div>
    );
  }

  // ─── Processing states (signing / confirming) ───
  if (effectiveState === "signing" || effectiveState === "confirming") {
    return (
      <div className={`flex flex-col items-center gap-3 ${compact ? "py-3" : "py-5"}`} aria-live="polite">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--palm)]/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--palm)] animate-spin" />
        </div>
        <p className="text-sm text-[var(--text)]">
          {effectiveState === "signing" ? "Approve in wallet…" : "Confirming on-chain…"}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {effectiveState === "signing"
            ? `Sign the ${paidLabel} transfer in your wallet`
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
          <span className="text-[var(--text-muted)]">$49</span>
        </div>

        {/* Pay button */}
        <button
          onClick={handleCheckout}
          disabled={!restored}
          className="w-full relative overflow-hidden rounded-lg px-5 py-3 text-sm font-semibold text-white cursor-pointer transition-transform ease-out hover:scale-[1.01] active:scale-[0.99] shadow-lg bg-gradient-to-br from-[var(--palm)] to-[var(--palm-light)] disabled:opacity-50"
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            <PalmIcon size={16} />
            Pay {method === "sol" ? "in SOL" : `49 ${METHOD_LABEL[method]}`}
          </span>
        </button>

        {/* Method toggle */}
        <div className="flex items-center justify-center gap-2">
          {(["sol", "usdc", "pusd"] as PayMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] cursor-pointer transition-colors ${
                method === m
                  ? "border-[var(--palm)]/60 bg-[var(--palm)]/15 text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Non-custodial
          </span>
          <span>·</span>
          <span>Verified on-chain</span>
          <span>·</span>
          <span>Solana</span>
        </div>
      </div>
    );
  }

  // ─── Idle state (no wallet connected) ───
  return (
    <div className={`flex flex-col gap-3 ${compact ? "" : "py-2"}`}>
      <button
        onClick={() => setVisible(true)}
        className="w-full relative overflow-hidden rounded-lg px-5 py-3 text-sm font-semibold text-white cursor-pointer transition-transform ease-out hover:scale-[1.01] active:scale-[0.99] shadow-lg bg-gradient-to-br from-[var(--palm)] to-[var(--palm-light)]"
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          <PalmIcon size={16} />
          Pay on Solana
        </span>
      </button>
      <p className="text-xs text-[var(--text-muted)] text-center">
        Connect a Solana wallet to pay $49 — SOL, USDC or PUSD
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
