"use client";

/**
 * EditionPublish — commission + publish an Earn sponsor edition with PUSD.
 *
 * Flow: create intent (POST /api/editions) → unsigned transfer
 * (POST /api/checkout/palmusd?purpose=edition) → wallet signs → submit →
 * verify+publish (POST /api/checkout/palmusd/verify) → the page reloads into
 * its published state. Same payment rail as Pro, different purpose.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { track } from "@/lib/track";

type PublishState = "idle" | "preparing" | "signing" | "confirming" | "publishing" | "success" | "error";

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
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  const handlePublish = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setError(null);
    setState("preparing");

    try {
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

      // 2. Unsigned transfer for the edition price.
      const res = await fetch("/api/checkout/palmusd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          purpose: "edition",
          editionId: intent.intentId,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to prepare payment");

      setState("signing");
      const tx = Transaction.from(Buffer.from(data.unsignedTxBase64, "base64"));
      const signedTx = await signTransaction(tx);

      setState("confirming");
      const { Connection } = await import("@solana/web3.js");
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      // 3. Verify + publish.
      setState("publishing");
      const verifyRes = await fetch("/api/checkout/palmusd/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          txSignature: signature,
          purpose: "edition",
          editionId: intent.intentId,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.ok) throw new Error(verifyData.error || "Payment verification failed");

      setPermalink(verifyData.permalink ?? `/earn/${slug}`);
      setExplorerUrl(verifyData.explorerUrl);
      setState("success");
      track("edition_published", { sponsor, slug });
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Publish failed";
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        setState("idle");
        return;
      }
      setError(msg);
      setState("error");
    }
  }, [publicKey, signTransaction, sponsor, slug, router]);

  if (state === "success") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[var(--success)]">Published — this page is now pinned and attested.</p>
        <div className="flex items-center gap-4 text-xs">
          {permalink && (
            <a href={permalink} className="text-[var(--accent)] hover:underline">
              {permalink}
            </a>
          )}
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--palm-light)] hover:underline">
              payment receipt →
            </a>
          )}
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex items-center gap-3">
        <p className="text-xs text-[var(--danger)]">{error}</p>
        <button
          onClick={() => { setError(null); setState("idle"); }}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state !== "idle") {
    const label =
      state === "preparing" ? "Preparing…"
      : state === "signing" ? "Approve in wallet…"
      : state === "confirming" ? "Confirming on-chain…"
      : "Publishing your edition…";
    return (
      <div className="flex items-center gap-3">
        <div className="relative w-4 h-4">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--palm)]/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--palm)] animate-spin" />
        </div>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <button
        onClick={connected && publicKey ? handlePublish : () => setVisible(true)}
        className="relative overflow-hidden rounded-lg px-4 py-2.5 text-sm font-semibold text-white cursor-pointer transition-transform ease-out hover:scale-[1.01] active:scale-[0.99] bg-gradient-to-br from-[var(--palm)] to-[var(--palm-light)]"
      >
        {connected && publicKey ? `Publish this page — ${pricePusd} PUSD` : "Connect wallet to publish"}
      </button>
      {connected && publicKey && (
        <span className="text-xs text-[var(--text-muted)]">
          {wallet?.adapter.name} · {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
        </span>
      )}
      <span className="text-xs text-[var(--text-muted)]">
        pins the snapshot · issues the receipt · yours to share
      </span>
    </div>
  );
}
