"use client";
/**
 * AuctionStage — the choreographed "moment" of an auction.
 *
 * Owns the transitions from WANT → bids → rationale → deposit → commit → release. Consumes
 * results from /api/market/demo one phase at a time and animates each step so a viewer
 * sees the machinery *feel* alive: bid cards fly in, rationale types out, SOL falls, the
 * manifest fingerprint fills in.
 *
 * The stage doesn't fetch on its own — it's driven by the parent page via props.
 */
import { useEffect, useState } from "react";
import type { Bid, Deal, Want } from "@/lib/types";
import { WantCard } from "./WantCard";
import { BidCard } from "./BidCard";
import { StreamingRationale } from "./StreamingRationale";
import { HashFingerprint } from "./HashFingerprint";
import { EscrowStatePill } from "./EscrowStatePill";

export type StagePhase =
  | "warmup"     // want lands, bids arrive
  | "picking"    // buyer rationale streams
  | "depositing"
  | "committing"
  | "releasing"
  | "settled";

export function AuctionStage({
  want,
  bids,
  deal,
  phase,
  audio,
  onRationaleDone,
}: {
  want: Want | null;
  bids: Bid[];
  deal: Deal | null;
  phase: StagePhase;
  audio: string | null;
  onRationaleDone?: () => void;
}) {
  const [bidsRevealed, setBidsRevealed] = useState(0);

  useEffect(() => {
    if (!want) {
      setBidsRevealed(0);
      return;
    }
    setBidsRevealed(0);
    const timers = bids.map((_, i) =>
      setTimeout(() => setBidsRevealed((n) => Math.max(n, i + 1)), 150 + i * 200),
    );
    return () => timers.forEach(clearTimeout);
  }, [want?.id, bids.length]);

  const winnerBidId = deal?.winningBid?.id;
  const runnerUpId =
    deal && bids.length > 1
      ? bids.filter((b) => b.id !== winnerBidId).sort((a, b) => a.priceLamports - b.priceLamports)[0]?.id
      : undefined;

  if (!want) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--text-muted)]">
        Waiting for the Watchdog to detect drift…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WantCard want={want} />

      {bids.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-wider text-[var(--text-muted)]">
            Sellers bid ({bids.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            {bids.map((b, i) => (
              <div
                key={b.id}
                className={[
                  "transition duration-500",
                  i < bidsRevealed ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
                ].join(" ")}
              >
                <BidCard
                  bid={b}
                  isWinner={b.id === winnerBidId && phase !== "picking"}
                  isRunnerUp={b.id === runnerUpId && phase !== "picking"}
                  dimmed={phase === "settled" && b.id !== winnerBidId}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {deal && (phase === "picking" || phase === "depositing" || phase === "committing" || phase === "releasing" || phase === "settled") && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
            <span>🤖 Buyer picks</span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-muted)]">
              {deal.want.buyer.label ?? "Watchdog"} LLM
            </span>
          </div>
          <p className="text-sm text-[var(--text)]">
            <StreamingRationale
              text={deal.award.buyerRationale}
              cps={60}
              onComplete={onRationaleDone}
            />
          </p>
        </div>
      )}

      {deal && (phase === "depositing" || phase === "committing" || phase === "releasing" || phase === "settled") && (
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <EscrowStatePill deal={deal} />
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col items-center gap-2">
            <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
              manifest hash
            </div>
            <HashFingerprint
              hashHex={deal.manifestHash ?? null}
              filled={phase === "committing" || phase === "releasing" || phase === "settled"}
              size={7}
            />
            <div className="text-xs text-[var(--text-muted)]">
              {deal.manifestHash
                ? "on-chain — proves what was delivered"
                : "seller committing…"}
            </div>
          </div>
        </div>
      )}

      {phase === "settled" && audio && (
        <section className="rounded-lg border-2 border-[var(--success)] bg-[var(--success)]/5 p-4 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-[var(--success)] font-semibold">
              <span>✓ Settled</span>
              <span className="text-[var(--text-muted)] font-normal">— episode is the receipt</span>
            </div>
            {deal?.explorer.release && (
              <a
                href={deal.explorer.release}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--accent)] hover:underline"
              >
                release tx ↗
              </a>
            )}
          </div>
          <audio controls autoPlay className="w-full" src={`data:audio/mpeg;base64,${audio}`} />
        </section>
      )}
    </div>
  );
}
