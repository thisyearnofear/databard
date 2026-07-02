/**
 * POST /api/market/head-to-head — two Watchdogs race for the same schema.
 *
 * Frugal (budget 0.08 SOL) and Premium (budget 0.15 SOL) each post a WANT with identical
 * focus + evidence hints. Sellers auto-bid on each. Buyers pick — usually a different
 * winner per side, because the fit/price mix is budget-sensitive.
 *
 * Phases (same shape as /api/market/demo): post → award → deliver → release. Each phase
 * returns { frugal, premium } side-by-side.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Deal, Want, Bid } from "@/lib/types";
import { getDemoSchema } from "@/lib/market/demo-fixtures";
import { analyzeSchema } from "@/lib/schema-analysis";
import { computeDelta } from "@/lib/market/watchdog";
import { autoBidInternal } from "@/lib/market/sellers";
import { createWant, getDeal, listBidsForWant } from "@/lib/market/protocol";
import { award as awardDeal, deliver, releaseDeal } from "@/lib/market/orchestrator";
import { getWatchdogKeypair, sha256 } from "@/lib/settlement/backends/escrow";
import { randomBytes } from "crypto";

interface Body {
  phase: "post" | "award" | "deliver" | "release";
  frugalWantId?: string;
  premiumWantId?: string;
  fixture?: "ecommerce" | "web3";
}

const RACE_BUDGETS = {
  frugal: { label: "Frugal Fund", budgetLamports: 80_000_000, deadlineSec: 300 },
  premium: { label: "Premium Fund", budgetLamports: 150_000_000, deadlineSec: 300 },
};

async function postSide(
  side: "frugal" | "premium",
  fixture: "ecommerce" | "web3",
): Promise<{ want: Want; bids: Bid[] }> {
  const schema = await getDemoSchema(fixture);
  const insights = analyzeSchema(schema);
  const { focus, hints } = computeDelta(insights, null);
  const cfg = RACE_BUDGETS[side];
  const want = createWant({
    buyer: {
      kind: "agent",
      publicKey: getWatchdogKeypair().publicKey.toBase58(),
      label: cfg.label,
    },
    schemaFqn: schema.fqn,
    focus,
    budgetLamports: cfg.budgetLamports,
    deadlineSec: cfg.deadlineSec,
    evidenceHints: hints,
  });
  const bids = autoBidInternal(want);
  return { want, bids };
}

async function deliverSide(wantId: string): Promise<Deal> {
  const manifest = {
    episodeId: `race-${randomBytes(4).toString("hex")}`,
    schemaFqn: getDeal(wantId)?.want.schemaFqn ?? "unknown",
    personaId: getDeal(wantId)?.personaId ?? "unknown",
    audioSha256: sha256(`race-${wantId}`).hex,
    generatedAt: new Date().toISOString(),
  };
  const result = await deliver({ wantId, manifest });
  return result.deal;
}

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const fixture = body.fixture ?? "ecommerce";

    if (body.phase === "post") {
      const [frugal, premium] = await Promise.all([
        postSide("frugal", fixture),
        postSide("premium", fixture),
      ]);
      return NextResponse.json({
        ok: true,
        frugal: { wantId: frugal.want.id, want: frugal.want, bids: frugal.bids },
        premium: { wantId: premium.want.id, want: premium.want, bids: premium.bids },
      });
    }

    if (!body.frugalWantId || !body.premiumWantId) {
      return NextResponse.json(
        { ok: false, error: "frugalWantId and premiumWantId required for non-post phases" },
        { status: 400 },
      );
    }

    if (body.phase === "award") {
      const [frugal, premium] = await Promise.all([
        awardDeal(body.frugalWantId),
        awardDeal(body.premiumWantId),
      ]);
      return NextResponse.json({
        ok: true,
        frugal: { deal: frugal.deal },
        premium: { deal: premium.deal },
      });
    }

    if (body.phase === "deliver") {
      const [frugal, premium] = await Promise.all([
        deliverSide(body.frugalWantId),
        deliverSide(body.premiumWantId),
      ]);
      return NextResponse.json({ ok: true, frugal: { deal: frugal }, premium: { deal: premium } });
    }

    if (body.phase === "release") {
      const [frugal, premium] = await Promise.all([
        releaseDeal(body.frugalWantId),
        releaseDeal(body.premiumWantId),
      ]);
      return NextResponse.json({
        ok: true,
        frugal: { deal: frugal.deal },
        premium: { deal: premium.deal },
      });
    }

    return NextResponse.json({ ok: false, error: "unknown phase" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** Convenience: list current bids for either side (used by the dashboard). */
export async function GET(req: NextRequest) {
  const wantId = req.nextUrl.searchParams.get("wantId");
  if (!wantId) return NextResponse.json({ ok: false, error: "wantId required" }, { status: 400 });
  return NextResponse.json({ ok: true, bids: listBidsForWant(wantId) });
}
