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
import { chatFallback, isLlmConfigured } from "../llm-providers";
import { reputationBoost } from "./reputation";

export interface PickResult {
  award: Award;
  runnerUp?: Bid;
}

const FIT_WEIGHTS: Record<string, Partial<Record<string, number>>> = {
  // How well each persona serves each focus (0..1). Missing = neutral (0.5).
  signal:   { overview: 0.9, governance: 0.7, freshness: 0.5, quality: 0.4, coverage: 0.4, lineage: 0.4 },
  cascade:  { quality: 0.95, lineage: 0.9, coverage: 0.85, governance: 0.7, overview: 0.6, freshness: 0.5 },
  newsroom: { freshness: 0.95, quality: 0.45, overview: 0.5, governance: 0.4, coverage: 0.4, lineage: 0.5 },
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
 * LLM-backed pick — asks a real model to weigh the bids and produce a rationale.
 *
 * The heuristic is used as a "hint" (via scoreBid inputs) so the LLM has our scoring
 * intuition on hand, but the model can override on qualitative grounds a formula can't
 * capture (e.g. "Cascade's reasoning for THIS want is sharper than the score suggests").
 *
 * Returns null on any LLM error — caller falls back to heuristic. Never blocks the market.
 */
export async function pickBidLLM(want: Want, bids: Bid[]): Promise<PickResult | null> {
  if (!isLlmConfigured()) return null;
  const qualifying = bids.filter((b) => b.priceLamports <= want.budgetLamports);
  if (qualifying.length === 0) return null;

  const scored = qualifying
    .map((b) => ({ bid: b, score: scoreBid(b, want) }))
    .sort((a, b) => b.score - a.score);

  const system = `You are the buyer's decision LLM in an on-chain AI marketplace.
You get a WANT (what needs briefing) and a set of BIDS from AI-persona sellers.
Pick exactly one bid. Reply in strict JSON: {"winningBidId": string, "rationale": string}
Rationale is 1–2 sentences, mentions the winning persona by name, cites the focus and price,
and briefly compares to the runner-up. No preamble, no code fences, no markdown.`;

  const budgetSol = (want.budgetLamports / 1e9).toFixed(3);
  const bidsBlob = scored
    .map((s, i) => {
      const persona = getPersona(s.bid.personaId);
      return `bid ${i + 1}: id=${s.bid.id} persona=${persona?.name ?? s.bid.personaId} ` +
        `price=${(s.bid.priceLamports / 1e9).toFixed(4)} SOL etaSec=${s.bid.etaSec} ` +
        `heuristicScore=${s.score.toFixed(2)} reputation+${(reputationBoost(s.bid.personaId) * 100).toFixed(0)}% ` +
        `reasoning="${s.bid.reasoning}"`;
    })
    .join("\n");

  const user = `WANT id=${want.id}
schemaFqn=${want.schemaFqn}
focus=${want.focus}
budget=${budgetSol} SOL
deadlineSec=${want.deadlineSec}
evidenceHints=${JSON.stringify(want.evidenceHints ?? [])}

BIDS (sorted by heuristic):
${bidsBlob}

Pick the winning bid. Prefer fit over price for critical focuses (quality, governance, freshness deltas),
but if a cheaper bid is materially close in fit, take it. Return only the JSON.`;

  const result = await chatFallback({ system, user, maxTokens: 400 });
  if (!result) return null;

  // Model may wrap in fences despite instructions — strip them.
  const cleaned = result.text
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();

  let parsed: { winningBidId?: string; rationale?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const winner = qualifying.find((b) => b.id === parsed.winningBidId);
  if (!winner || typeof parsed.rationale !== "string" || parsed.rationale.length < 10) return null;

  const runnerUp = scored.find((s) => s.bid.id !== winner.id)?.bid;
  return {
    award: {
      wantId: want.id,
      winningBidId: winner.id,
      buyerRationale: `${parsed.rationale.trim()} — via ${result.provider}`,
      awardedAt: new Date().toISOString(),
    },
    runnerUp,
  };
}

/**
 * Main entry — try LLM first (natural rationale, more legible for judges + users), fall back to
 * heuristic on any error or missing keys. This preserves the market's uptime: the loop and
 * dashboard NEVER block on an LLM call.
 */
export async function pickBid(want: Want, bids: Bid[]): Promise<PickResult | null> {
  const llm = await pickBidLLM(want, bids);
  if (llm) return llm;
  return pickBidHeuristic(want, bids);
}
