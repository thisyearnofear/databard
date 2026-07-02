/**
 * POST /api/market/graph-demo — the "graph not pair" story.
 *
 * A Consumer agent posts a digest WANT spanning multiple schemas. Digest bids (the only
 * bidder — other personas don't do aggregation). Digest wins, deposits into parent escrow,
 * then Digest runs its own mini-market by posting sub-WANTs to content personas for each
 * schema. Every step is a real devnet tx.
 *
 * Response includes the parent Deal, the list of sub-Deals, the combined audio, and the
 * on-chain manifest hash for verification.
 *
 * Body: { fixture?: "ecommerce"|"web3", phase?: "post"|"award"|"deliver"|"release" }
 */
import { NextRequest, NextResponse } from "next/server";
import { createWant, getDeal } from "@/lib/market/protocol";
import { autoBidInternal } from "@/lib/market/sellers";
import { award, releaseDeal } from "@/lib/market/orchestrator";
import { getConsumerActor, resellerDeliver } from "@/lib/market/reseller";
import { getSubWantIds } from "@/lib/market/reseller";
import { getDemoAudio, getDemoSchema, type DemoFixtureId } from "@/lib/market/demo-fixtures";

// Multi-schema digest — one canned fixture split into two "sources" for demo purposes.
// In reality these would be separate warehouses; the shape is what matters.
const DIGEST_SCHEMAS = ["acme.orders", "acme.customers", "acme.events"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fixtureId: DemoFixtureId = body.fixture === "web3" ? "web3" : "ecommerce";
    const phase = (body.phase ?? "all") as "post" | "award" | "deliver" | "release" | "all";
    const existingWantId: string | undefined = body.wantId;

    // 1) POST — Consumer posts a digest WANT
    let wantId = existingWantId;
    if (!wantId) {
      const schema = await getDemoSchema(fixtureId);
      const consumer = getConsumerActor();
      const want = createWant({
        buyer: consumer,
        schemaFqn: schema.fqn,
        focus: "overview",
        budgetLamports: 80_000_000, // 0.08 SOL — comfortably above 3-schema Digest pricing
        deadlineSec: 600,
        wantType: "digest",
        digestSchemas: DIGEST_SCHEMAS,
      });
      autoBidInternal(want);
      wantId = want.id;
      if (phase === "post") {
        return NextResponse.json({ ok: true, wantId, want });
      }
    }

    // 2) AWARD — Consumer picks Digest (the only bidder), deposits into parent escrow
    let parentDeal = getDeal(wantId!);
    if (!parentDeal || parentDeal.state === "open") {
      const awarded = await award(wantId!);
      parentDeal = awarded.deal;
      if (phase === "award") {
        return NextResponse.json({ ok: true, wantId, parentDeal });
      }
    }

    // 3) DELIVER — Digest runs its sub-market, concatenates, commits parent hash
    if (parentDeal.state === "deposited") {
      const delivered = await resellerDeliver({
        parentWantId: wantId!,
        demoFixture: fixtureId,
      });
      parentDeal = delivered.parentDeal;
      if (phase === "deliver") {
        return NextResponse.json({
          ok: true,
          wantId,
          parentDeal,
          subDeals: delivered.subDeals,
          audio: delivered.combinedAudio.toString("base64"),
          manifestHashHex: delivered.parentManifestHashHex,
        });
      }
    }

    // 4) RELEASE — Consumer releases parent; orchestrator cascades to sub-escrows
    if (parentDeal.state === "delivered") {
      const released = await releaseDeal(wantId!);
      parentDeal = released.deal;
    }

    const audio = await getDemoAudio(fixtureId);
    const subWantIds = getSubWantIds(wantId!);
    const subDeals = subWantIds.map((id) => getDeal(id)).filter(Boolean);
    return NextResponse.json({
      ok: true,
      wantId,
      parentDeal,
      subDeals,
      audio: audio.toString("base64"),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
