/**
 * Buyer strategy — the LLM (or heuristic) that picks a bid.
 *
 * The buyer is value-maximizing under a hard budget cap. It doesn't just take the cheapest
 * bid; it weighs the persona's fit against what the WANT is asking for.
 *
 * Two modes:
 * - `heuristic` (default): pure scoring function. Fast, deterministic, no API call.
 * - `llm`: uses the same LLM the script generator already uses to produce a rationale. Falls
 *          back to heuristic on error.
 *
 * The Watchdog uses this via `pickBid`. External buyers implement their own — this file is a
 * reference implementation.
 */
import type { Award, Bid, Want } from "../types";
import { getPersona } from "../voice-config";
import { reputationBoost } from "./reputation";

export interface PickResult {
  award: Award;
  runnerUp?: Bid;
}

const FIT_WEIGHTS: Record<string, Partial<Record<string, number>>> = {
  // How well each persona serves each focus (0..1). Missing = neutral (0.5).
  signal:   { overview: 0.9, governance: 0.7, freshness: 0.5, quality: 0.4, coverage: 0.4, lineage: 0.4 },
  cascade:  { quality: 0.95, lineage: 0.9, coverage: 0.85, governance: 0.7, overview: 0.6, freshness: 0.5 },
  newsroom: { freshness: 0.95, quality: 0.7, overview: 0.5, governance: 0.4, coverage: 0.4, lineage: 0.5 },
};

function fitScore(personaId: string, focus: string): number {
  return FIT_WEIGHTS[personaId]?.[focus] ?? 0.5;
}

/** Score bid on 0..1. Higher = better. Blends fit (68%) with price value (32%),
 *  then adds a small reputation boost from settled prior wins (max +0.06).
 *  The 68/32 split means the persona best-suited to the WANT usually wins even at premium price,
 *  but a heavy price undercut can still swing it — a legitimate market dynamic. */
function scoreBid(bid: Bid, want: Want): number {
  const fit = fitScore(bid.personaId, want.focus);
  const priceValue = 1 - bid.priceLamports / want.budgetLamports; // cheaper = higher
  const base = 0.68 * fit + 0.32 * priceValue;
  const repBoost = reputationBoost(bid.personaId) * 0.6; // scale the +10% cap into fit weight
  return Math.min(1, base + repBoost);
}

/**
 * Pure heuristic pick — no LLM. Produces a legible rationale so the dashboard can show the
 * buyer's reasoning without an API round-trip.
 */
export function pickBidHeuristic(want: Want, bids: Bid[]): PickResult | null {
  if (bids.length === 0) return null;
  const priced = bids
    .filter((b) => b.priceLamports <= want.budgetLamports)
    .map((b) => ({ bid: b, score: scoreBid(b, want) }))
    .sort((a, b) => b.score - a.score);
  if (priced.length === 0) return null;

  const winner = priced[0];
  const runnerUp = priced[1];
  const winnerPersona = getPersona(winner.bid.personaId);
  const focus = want.focus;

  const boost = reputationBoost(winner.bid.personaId);
  const boostText = boost > 0.005 ? ` (reputation +${(boost * 100).toFixed(0)}%)` : "";
  const rationale = runnerUp
    ? `Picked ${winnerPersona?.name ?? winner.bid.personaId} for a ${focus} brief — fit ${(fitScore(winner.bid.personaId, focus) * 100).toFixed(0)}%${boostText}, price ${(winner.bid.priceLamports / 1e9).toFixed(3)} SOL. Ran ahead of ${getPersona(runnerUp.bid.personaId)?.name ?? runnerUp.bid.personaId} (${((runnerUp.score) * 100).toFixed(0)}% overall score).`
    : `Only qualifying bid: ${winnerPersona?.name ?? winner.bid.personaId} at ${(winner.bid.priceLamports / 1e9).toFixed(3)} SOL.`;

  return {
    award: {
      wantId: want.id,
      winningBidId: winner.bid.id,
      buyerRationale: rationale,
      awardedAt: new Date().toISOString(),
    },
    runnerUp: runnerUp?.bid,
  };
}

/**
 * Main entry — currently returns the heuristic pick. Wire in the LLM version behind a flag
 * once `script-generator.ts`'s LLM client is exposed cleanly.
 */
export function pickBid(want: Want, bids: Bid[]): PickResult | null {
  return pickBidHeuristic(want, bids);
}
