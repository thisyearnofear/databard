/**
 * Market protocol — state machine, persistence, validation.
 * Single source of truth for the WANT → BID → AWARD → DEPOSITED → DELIVERED → RELEASED lifecycle.
 *
 * Types live in src/lib/types.ts (shared domain). This module owns the transitions and storage.
 */
import { randomBytes } from "crypto";
import { store } from "../store";
import type { Bid, Deal, DealRef, MarketActor, ResearchFocus, Want, WantState } from "../types";

const WANT_TTL = 86400 * 7;   // 1 week
const BID_TTL = 86400 * 7;
const DEAL_TTL = 86400 * 365; // 1 year — deals are receipts

/* -------------------------------- Wants ---------------------------------- */

export interface CreateWantInput {
  buyer: MarketActor;
  schemaFqn: string;
  focus: ResearchFocus;
  budgetLamports: number;
  deadlineSec: number;
  evidenceHints?: { table: string; reason: string }[];
  wantType?: "brief" | "digest";
  digestSchemas?: string[];
  parentWantId?: string;
}

export function createWant(input: CreateWantInput): Want {
  if (input.budgetLamports <= 0) throw new Error("budgetLamports must be positive");
  if (input.deadlineSec < 30) throw new Error("deadlineSec must be at least 30");
  const want: Want = {
    id: `want_${randomBytes(6).toString("hex")}`,
    createdAt: new Date().toISOString(),
    state: "open",
    ...input,
  };
  store.set(`want:${want.id}`, want, WANT_TTL);
  return want;
}

export function getWant(id: string): Want | null {
  return store.get<Want>(`want:${id}`);
}

export function listOpenWants(): Want[] {
  return store
    .keys("want:")
    .map((k) => store.get<Want>(k))
    .filter((w): w is Want => w !== null && (w.state === "open" || w.state === "awarded"));
}

const VALID_TRANSITIONS: Record<WantState, WantState[]> = {
  open: ["awarded", "expired"],
  awarded: ["deposited", "expired"],
  deposited: ["delivered", "refunded"],
  delivered: ["released", "refunded"],
  released: [],
  refunded: [],
  expired: [],
};

export function transitionWant(id: string, next: WantState): Want {
  const want = getWant(id);
  if (!want) throw new Error(`Want ${id} not found`);
  if (!VALID_TRANSITIONS[want.state].includes(next)) {
    throw new Error(`Invalid transition ${want.state} → ${next} for want ${id}`);
  }
  const updated: Want = { ...want, state: next };
  store.set(`want:${want.id}`, updated, WANT_TTL);
  return updated;
}

/* --------------------------------- Bids ---------------------------------- */

export interface CreateBidInput {
  wantId: string;
  seller: MarketActor;
  personaId: string;
  priceLamports: number;
  etaSec: number;
  reasoning: string;
}

export function createBid(input: CreateBidInput): Bid {
  const want = getWant(input.wantId);
  if (!want) throw new Error(`Want ${input.wantId} not found`);
  if (want.state !== "open") throw new Error(`Want ${input.wantId} is not open for bids`);
  if (input.priceLamports > want.budgetLamports) {
    throw new Error(`Bid ${input.priceLamports} exceeds budget ${want.budgetLamports}`);
  }
  const bid: Bid = {
    id: `bid_${randomBytes(6).toString("hex")}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  store.set(`bid:${bid.wantId}:${bid.id}`, bid, BID_TTL);
  return bid;
}

export function listBidsForWant(wantId: string): Bid[] {
  return store
    .keys(`bid:${wantId}:`)
    .map((k) => store.get<Bid>(k))
    .filter((b): b is Bid => b !== null);
}

/* --------------------------------- Deals --------------------------------- */

/** Written once the buyer picks a bid and the escrow reference is minted. */
export function createDeal(deal: Deal): void {
  store.set(`deal:${deal.wantId}`, deal, DEAL_TTL);
  // Also index by reference so backends can look up deals from an on-chain transition.
  store.set(`deal-ref:${deal.reference}`, deal.wantId, DEAL_TTL);
}

export function getDeal(wantId: string): Deal | null {
  return store.get<Deal>(`deal:${wantId}`);
}

export function getDealByReference(reference: string): Deal | null {
  const wantId = store.get<string>(`deal-ref:${reference}`);
  return wantId ? getDeal(wantId) : null;
}

export function updateDeal(wantId: string, patch: Partial<DealRef>): Deal | null {
  const existing = getDeal(wantId);
  if (!existing) return null;
  const merged: Deal = {
    ...existing,
    ...patch,
    explorer: { ...existing.explorer, ...(patch.explorer ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  store.set(`deal:${merged.wantId}`, merged, DEAL_TTL);
  return merged;
}

export function listDeals(limit = 50): Deal[] {
  return store
    .keys("deal:")
    .map((k) => store.get<Deal>(k))
    .filter((d): d is Deal => d !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
