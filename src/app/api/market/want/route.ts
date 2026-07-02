/**
 * POST /api/market/want  — post a WANT to the market
 *
 * Body (all required unless noted):
 *   schemaFqn:      string
 *   focus:          ResearchFocus  (overview | quality | coverage | lineage | governance | freshness)
 *   budgetLamports: number         (hard cap; bids above this are rejected)
 *   deadlineSec:    number         (>= 30)
 *   buyer:          { kind, publicKey, label? }  (optional; defaults to Watchdog server-side buyer)
 *   evidenceHints:  { table, reason }[]          (optional; Watchdog populates from delta)
 *
 * Returns { ok, want, bids }.
 *
 * Public endpoint — external agents can call this. Internal personas auto-bid on creation.
 */
import { NextRequest, NextResponse } from "next/server";
import { post } from "@/lib/market/orchestrator";
import { getWatchdogKeypair } from "@/lib/settlement/backends/escrow";
import type { MarketActor, ResearchFocus } from "@/lib/types";

const VALID_FOCUSES: ResearchFocus[] = [
  "overview", "quality", "coverage", "lineage", "governance", "freshness",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      schemaFqn,
      focus,
      budgetLamports,
      deadlineSec,
      buyer,
      evidenceHints,
    } = body as {
      schemaFqn?: string;
      focus?: ResearchFocus;
      budgetLamports?: number;
      deadlineSec?: number;
      buyer?: MarketActor;
      evidenceHints?: { table: string; reason: string }[];
    };

    if (!schemaFqn) return NextResponse.json({ ok: false, error: "schemaFqn required" }, { status: 400 });
    if (!focus || !VALID_FOCUSES.includes(focus)) {
      return NextResponse.json({ ok: false, error: `focus must be one of ${VALID_FOCUSES.join(", ")}` }, { status: 400 });
    }
    if (!Number.isFinite(budgetLamports) || (budgetLamports as number) <= 0) {
      return NextResponse.json({ ok: false, error: "budgetLamports must be positive number" }, { status: 400 });
    }
    if (!Number.isFinite(deadlineSec) || (deadlineSec as number) < 30) {
      return NextResponse.json({ ok: false, error: "deadlineSec must be >= 30" }, { status: 400 });
    }

    // Default buyer = the server-side Watchdog. External agents supply their own actor.
    const buyerActor: MarketActor = buyer ?? {
      kind: "agent",
      publicKey: getWatchdogKeypair().publicKey.toBase58(),
      label: "Watchdog",
    };

    const { want, bids } = post({
      buyer: buyerActor,
      schemaFqn,
      focus,
      budgetLamports: budgetLamports as number,
      deadlineSec: deadlineSec as number,
      evidenceHints,
    });

    return NextResponse.json({ ok: true, want, bids });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
