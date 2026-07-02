/**
 * Seller registry: internal persona sellers + external seller support.
 *
 * Internal sellers are the personas from voice-config.ts. When a WANT is posted, each internal
 * seller uses its pricingStrategy to auto-bid (constrained by cost floor + budget).
 *
 * External sellers register via POST /api/market/sellers (future); they'd poll /api/market/want
 * and post bids directly. The protocol is the same — this module just seeds the market.
 */
import { randomBytes } from "crypto";
import { Keypair } from "@solana/web3.js";
import type { Bid, MarketActor, Want } from "../types";
import { PERSONAS, getPersona, type PersonaSeller } from "../voice-config";
import { store } from "../store";
import { createBid } from "./protocol";

const KEYPAIR_TTL = 86400 * 365 * 10; // 10 years — persistent for the demo

/**
 * Load-or-create the seller's Solana keypair. Persisted so restarts don't invalidate escrow
 * references. Uses the raw secret key (32 bytes) — not a real wallet, just a demo signer.
 */
export function getSellerKeypair(personaId: string): Keypair {
  const key = `seller-key:${personaId}`;
  const cached = store.get<string>(key);
  if (cached) {
    const bytes = Buffer.from(cached, "base64");
    return Keypair.fromSecretKey(bytes);
  }
  const kp = Keypair.generate();
  store.set(key, Buffer.from(kp.secretKey).toString("base64"), KEYPAIR_TTL);
  return kp;
}

export function getSellerActor(personaId: string): MarketActor {
  const persona = getPersona(personaId);
  if (!persona) throw new Error(`Unknown persona: ${personaId}`);
  const kp = getSellerKeypair(personaId);
  return {
    kind: "agent",
    publicKey: kp.publicKey.toBase58(),
    label: persona.name,
  };
}

/**
 * Compute a rough context size + urgency signal for pricing. This is intentionally cheap — the
 * expensive analysis happens post-award when the pipeline runs.
 */
function estimatePricingContext(want: Want): { contextSize: number; urgency: number } {
  const hintCount = (want.evidenceHints ?? []).length;
  // contextSize grows with hinted evidence — a proxy for how much there is to talk about.
  const contextSize = hintCount * 5 + 20;
  // urgency scales inversely with deadline (300s = mid; <60s = urgent; >600s = relaxed).
  const urgency = Math.max(0, Math.min(1, 1 - want.deadlineSec / 600));
  return { contextSize, urgency };
}

/**
 * Auto-generate bids for all internal personas for this WANT. Each persona's pricing strategy
 * decides its own price + reasoning; bids over budget are silently dropped (the persona chose
 * not to compete on price).
 */
export function autoBidInternal(want: Want): Bid[] {
  const ctx = estimatePricingContext(want);
  const wantType = want.wantType ?? "brief";
  const bids: Bid[] = [];
  for (const persona of PERSONAS) {
    // Skip personas that don't bid on this WANT type — content vs reseller separation.
    if (!persona.bidsOn.includes(wantType)) continue;
    const quote = persona.pricingStrategy({ want, ...ctx });
    const price = Math.max(quote.priceLamports, persona.costFloorLamports);
    if (price > want.budgetLamports) continue; // Priced out, doesn't bid
    const seller = getSellerActor(persona.id);
    try {
      const bid = createBid({
        wantId: want.id,
        seller,
        personaId: persona.id,
        priceLamports: price,
        etaSec: etaForPersona(persona),
        reasoning: quote.reasoning,
      });
      bids.push(bid);
    } catch {
      // Bid rejected (want not open, over budget after tie-breaking, etc.) — skip.
    }
  }
  return bids;
}

/** ETA per persona style — Signal is fast (headline only), Cascade slower (drill-down). */
function etaForPersona(persona: PersonaSeller): number {
  switch (persona.id) {
    case "signal": return 45;
    case "cascade": return 180;
    case "newsroom": return 30;
    default: return 120;
  }
}

/** Generate an opaque reference (32-byte Pubkey) for a Deal. Used as escrow PDA seed. */
export function generateReference(): string {
  return Keypair.generate().publicKey.toBase58();
}

/** Convenience: fresh random id for external actors that don't have a wallet yet. */
export function generateExternalActorId(): string {
  return `ext_${randomBytes(6).toString("hex")}`;
}
