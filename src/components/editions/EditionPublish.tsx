"use client";

/**
 * EditionPublish — commission + publish an Earn sponsor edition with PUSD.
 *
 * Flow: create intent (POST /api/editions) → unsigned transfer
 * (POST /api/checkout/palmusd?purpose=edition) → wallet signs → submit →
 * verify+publish (POST /api/checkout/palmusd/verify) → the page reloads into
 * its published state. Same payment rail as Pro, different purpose.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PublicationFrame, publicationStage } from "./PublicationFrame";
import { CopyReportLink } from "./CopyReportLink";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction, clusterApiUrl } from "@solana/web3.js";
import { track } from "@/lib/track";
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

type PublishState =
  | "idle"
  | "preparing"
  | "review"
  | "signing"
  | "confirming"
  | "publishing"
  | "pending"
  | "success"
  | "error";
type PayMethod = "pusd" | "usdc" | "sol";

const METHOD_LABEL: Record<PayMethod, string> = {
  pusd: "PUSD",
  usdc: "USDC",
  sol: "SOL",
};

interface PreparedPayment {
  intentId: string;
  slug: string;
  walletAddress: string;
  unsignedTxBase64: string;
  method: PayMethod;
  amountLabel: string;
  quoteId?: string;
  expiresAt?: string;
}

interface EditionPublishProps {
  sponsor: string;
  slug: string;
  pricePusd: number;
}

export function EditionPublish({ sponsor, slug, pricePusd }: EditionPublishProps) {
  const { publicKey, connected, signTransaction, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();
  const [state, setState] = useState<PublishState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [permalink, setPermalink] = useState<string | null>(null);
  const [explorer, setExplorer] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("sol");
  const [solAmount, setSolAmount] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [prepared, setPrepared] = useState<PreparedPayment | null>(null);
  const [restored, setRestored] = useState(false);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const slugRef = useRef(slug);
  slugRef.current = slug;
  const storageKey = checkoutStorageKey("edition", slug);

  const loadPending = useCallback((): PendingCheckout | null => {
    const saved = readPendingCheckout(window.localStorage, storageKey);
    if (saved) {
      setPending(saved);
      setState("pending");
    }
    return saved;
  }, [storageKey]);

  useEffect(() => {
    setPending(null);
    setPrepared(null);
    setError(null);
    try {
      const saved = loadPending();
      if (!saved) setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saved payment could not be read");
      setState("error");
    } finally {
      setRestored(true);
    }
  }, [loadPending]);

  const markPublished = useCallback((data: { permalink?: string; explorerUrl?: string }) => {
    setPermalink(data.permalink ?? `/earn/${slug}`);
    setExplorer(data.explorerUrl ?? null);
    setPending(null);
    setState("success");
    track("edition_published", { sponsor, slug });
    router.refresh();
  }, [router, slug, sponsor]);

  const checkPayment = useCallback(async (record: PendingCheckout) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    setError(null);
    track("edition_payment_recovery", { slug: record.slug ?? slug, method: record.method });
    try {
      const data = await recoverCheckout(record);
      clearPendingCheckout(window.localStorage, checkoutStorageKey("edition", record.slug ?? slug));
      if (slugRef.current === (record.slug ?? slug)) {
        markPublished(data as { permalink?: string; explorerUrl?: string });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment not confirmed yet. Check its status before paying again.");
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [markPublished, slug]);

  const handlePrepare = useCallback(async () => {
    if (!publicKey || !signTransaction || inFlight.current) return;
    inFlight.current = true;
    setError(null);

    try {
      try {
        if (loadPending()) return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Saved payment could not be read");
        setState("error");
        return;
      }

      setState("preparing");
      // 1. Register the intent — server validates the sponsor and the price.
      const intentRes = await fetch("/api/editions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sponsor }),
      });
      const intent = await intentRes.json();
      if (!intent.ok) throw new Error(intent.error || "Could not create the edition");
      if (intent.alreadyPublished) {
        setPermalink(intent.permalink);
        setState("success");
        router.refresh();
        return;
      }
      track("edition_intent", { sponsor: intent.sponsor, slug: intent.slug });

      // 2. Unsigned transfer for the edition price in the chosen method.
      const res = await fetch("/api/checkout/palmusd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          purpose: "edition",
          editionId: intent.intentId,
          method,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to prepare payment");
      const amountLabel =
        method === "sol" && typeof data.lamports === "number"
          ? `${(data.lamports / 1e9).toFixed(9).replace(/\.?0+$/, "")} SOL`
          : `${data.amount} ${METHOD_LABEL[method]}`;
      if (method === "sol" && typeof data.lamports === "number") {
        setSolAmount(data.lamports / 1e9);
      }

      setPrepared({
        intentId: intent.intentId,
        slug: intent.slug,
        walletAddress: publicKey.toBase58(),
        unsignedTxBase64: data.unsignedTxBase64,
        method,
        amountLabel,
        quoteId: data.quoteId,
        expiresAt: data.expiresAt,
      });
      setState("review");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Publish failed";
      setError(msg);
      setState("error");
    } finally {
      inFlight.current = false;
    }
  }, [publicKey, signTransaction, sponsor, router, method, loadPending]);

  const handleApprove = useCallback(async () => {
    if (!signTransaction || !prepared || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    let persisted = false;

    try {
      try {
        if (loadPending()) {
          setPrepared(null);
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Saved payment could not be read");
        setState("error");
        return;
      }

      if (!publicKey || publicKey.toBase58() !== prepared.walletAddress) {
        setPrepared(null);
        setState("idle");
        setError("Wallet changed. Review a new payment before approving.");
        return;
      }

      if (prepared.method === "sol" && prepared.expiresAt && Date.parse(prepared.expiresAt) <= Date.now()) {
        setPrepared(null);
        setState("idle");
        setError("Quote expired. Review a fresh quote before paying.");
        return;
      }

      setState("signing");
      const tx = Transaction.from(Buffer.from(prepared.unsignedTxBase64, "base64"));
      const signedTx = await signTransaction(tx);

      const sigBytes = signedTx.signature;
      if (!sigBytes) throw new Error("Missing wallet signature");
      const signature = signatureToBase58(sigBytes);

      const record: PendingCheckout = {
        version: 1,
        walletAddress: publicKey.toBase58(),
        purpose: "edition",
        editionId: prepared.intentId,
        slug: prepared.slug,
        method: prepared.method,
        quoteId: prepared.quoteId,
        txSignature: signature,
        amountLabel: prepared.amountLabel,
        createdAt: new Date().toISOString(),
      };

      setState("confirming");
      // 3. Verify + publish.
      let verifyData: { ok: boolean; permalink?: string; explorerUrl?: string; error?: string } | null = null;
      await submitRecoverableCheckout(record, {
        save: (p) => {
          savePendingCheckout(window.localStorage, storageKey, p);
          persisted = true;
          setPending(p);
        },
        submit: async () => {
          const { Connection } = await import("@solana/web3.js");
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL
            ?? clusterApiUrl((process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet") as "mainnet-beta" | "devnet" | "testnet");
          const connection = new Connection(rpcUrl, "confirmed");
          await connection.sendRawTransaction(signedTx.serialize());
        },
        verify: async (p) => {
          setState("publishing");
          verifyData = await recoverCheckout(p) as typeof verifyData;
          if (!verifyData!.ok) throw new Error(verifyData!.error || "Payment verification failed");
        },
      });

      clearPendingCheckout(window.localStorage, storageKey);
      setPrepared(null);
      if (slugRef.current === prepared.slug) {
        markPublished(verifyData!);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Publish failed";
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        if (!persisted) {
          setState("idle");
          setPrepared(null);
          return;
        }
        setPending(readPendingCheckout(window.localStorage, storageKey));
        setState("pending");
        return;
      }
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
  }, [publicKey, signTransaction, prepared, storageKey, markPublished, loadPending]);

  const handleRetry = useCallback(() => {
    try {
      if (loadPending()) return;
      setError(null);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saved payment could not be read");
      setState("error");
    }
  }, [loadPending]);

  const frame = (content: ReactNode) => <PublicationFrame sponsor={sponsor} stage={publicationStage(state)}>{content}</PublicationFrame>;

  if (state === "success") {
    return frame(
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[var(--success)]" aria-live="polite">
          Report published — dated snapshot preserved.
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          Payment confirmed on Solana. Evidence receipt available; this report is not anchored on-chain.
        </p>
        <div className="flex items-center gap-4 text-xs">
          {permalink && (
            <a href={permalink} className="text-[var(--accent)] hover:underline">
              Open published report
            </a>
          )}
          {explorer && (
            <a href={explorer} target="_blank" rel="noopener noreferrer" className="text-[var(--palm-light)] hover:underline">
              payment receipt →
            </a>
          )}
        </div>
        {permalink && <CopyReportLink href={permalink} />}
      </div>
    );
  }

  if (state === "pending" && pending) {
    const otherWallet = !connected || !publicKey || publicKey.toBase58() !== pending.walletAddress;
    return frame(
      <div className="flex flex-col gap-3" aria-live="polite">
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
            className="text-xs text-[var(--palm-light)] hover:underline"
          >
            view transaction →
          </a>
          <button
            onClick={() => checkPayment(pending)}
            disabled={checking}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-white cursor-pointer bg-gradient-to-br from-[var(--palm)] to-[var(--palm-light)] disabled:opacity-50"
          >
            {checking ? "Checking payment…" : "Check payment / finish publishing"}
          </button>
        </div>
        {error && <p className="text-xs text-[var(--danger)]" role="alert">{error}</p>}
      </div>
    );
  }

  if (state === "error") {
    return frame(
      <div className="flex items-center gap-3">
        <p className="text-xs text-[var(--danger)]" role="alert">{error}</p>
        <button
          onClick={handleRetry}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
        >
          Check saved payment
        </button>
      </div>
    );
  }

  if (state === "review" && prepared) {
    return frame(
      <div className="flex flex-col gap-3" aria-live="polite">
        <p className="text-xs text-[var(--text)]">
          Publish this report — {prepared.amountLabel}
          {` (list price $${pricePusd}) on ${process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet"}, plus network fees.`}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleApprove}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white cursor-pointer bg-gradient-to-br from-[var(--palm)] to-[var(--palm-light)]"
          >
            Approve payment
          </button>
          <button
            onClick={() => { setPrepared(null); setState("idle"); }}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-[var(--danger)]" role="alert">{error}</p>}
      </div>
    );
  }

  if (state !== "idle") {
    const label =
      state === "preparing" ? "Preparing…"
      : state === "signing"
        ? `Approve in wallet${prepared?.method === "sol" && solAmount ? ` — ${solAmount.toFixed(3)} SOL` : ""}…`
      : state === "confirming" ? "Confirming on-chain…"
      : "Publishing your edition…";
    return frame(
      <div className="flex items-center gap-3" aria-live="polite">
        <div className="relative w-4 h-4">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--palm)]/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--palm)] animate-spin" />
        </div>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
      </div>
    );
  }

  const payLabel =
    method === "sol" ? "pay in SOL" : `${pricePusd} ${METHOD_LABEL[method]}`;

  return frame(
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={connected && publicKey ? handlePrepare : () => setVisible(true)}
          disabled={!restored}
          className="relative overflow-hidden rounded-lg px-4 py-2.5 text-sm font-semibold text-white cursor-pointer transition-transform ease-out hover:scale-[1.01] active:scale-[0.99] bg-gradient-to-br from-[var(--palm)] to-[var(--palm-light)] disabled:opacity-50"
        >
          {connected && publicKey ? `Publish this page — ${payLabel}` : "Connect wallet to publish"}
        </button>
        {connected && publicKey && (
          <span className="text-xs text-[var(--text-muted)]">
            {wallet?.adapter.name} · {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
          </span>
        )}
        <span className="text-xs text-[var(--text-muted)]">
          preserves a dated report and its evidence receipt
        </span>
      </div>
      {error && <p className="text-xs text-[var(--danger)]" role="alert">{error}</p>}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          pay with
        </span>
        {(["sol", "usdc", "pusd"] as PayMethod[]).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] cursor-pointer transition-colors ${
              method === m
                ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-[var(--text)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
