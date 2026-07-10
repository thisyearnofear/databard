/**
 * POST /api/market/demo — one-shot demo cycle end-to-end using canned fixtures.
 *
 * Uses a fixture SchemaMeta + a pre-recorded audio file instead of hitting OpenMetadata /
 * ElevenLabs. Every OTHER step is real: Watchdog tick, three-persona bidding, buyer LLM
 * rationale, escrow deposit / commit / release on devnet.
 *
 * Body: { fixture?: "ecommerce"|"web3" (default "ecommerce"), phase?: "post"|"award"|"deliver"|"release" }
 *   - phase determines how far to run. Omitted phase = full cycle.
 *   - Repeated calls with the same wantId continue where the previous phase left off.
 *
 * Response includes the demo audio as base64 so the client can play it as the settlement
 * receipt without a second fetch.
 */
import { NextRequest, NextResponse } from "next/server";
import { computeDelta } from "@/lib/market/watchdog";
import { createWant } from "@/lib/market/protocol";
import { autoBidInternal } from "@/lib/market/sellers";
import { award, deliver, releaseDeal } from "@/lib/market/orchestrator";
import { sha256 } from "@/lib/settlement/backends/escrow";
import { getWatchdogKeypair } from "@/lib/settlement/backends/escrow";
import {
  getDemoAudio,
  getDemoEpisode,
  getDemoPriorSnapshot,
  getDemoSchema,
  type DemoFixtureId,
} from "@/lib/market/demo-fixtures";
import { analyzeSchema } from "@/lib/schema-analysis";
import { saveSnapshot } from "@/lib/schema-snapshots";
import { getDeal } from "@/lib/market/protocol";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fixtureId: DemoFixtureId = body.fixture === "web3" ? "web3" : "ecommerce";
    const phase = (body.phase ?? "all") as "post" | "award" | "deliver" | "release" | "all";
    const existingWantId: string | undefined = body.wantId;

    const schema = await getDemoSchema(fixtureId);
    const insights = analyzeSchema(schema);

    // Seed the snapshot store with the "before" state so delta computation works predictably.
    if (!existingWantId) {
      const priorSnapshot = await getDemoPriorSnapshot(fixtureId);
      saveSnapshot(priorSnapshot);
    }

    // 1) POST WANT + bids (unless we're continuing an existing one)
    let wantId = existingWantId;
    if (!wantId) {
      const priorSnapshot = await getDemoPriorSnapshot(fixtureId);
      const delta = computeDelta(insights, priorSnapshot.insights);
      const want = createWant({
        buyer: {
          kind: "agent",
          publicKey: getWatchdogKeypair().publicKey.toBase58(),
          label: "Watchdog",
        },
        schemaFqn: schema.fqn,
        focus: delta.focus,
        budgetLamports: 80_000_000,
        deadlineSec: 300,
        evidenceHints: delta.hints,
      });
      autoBidInternal(want);
      wantId = want.id;
      // Save the fresh snapshot AFTER computing delta.
      saveSnapshot({
        schemaFqn: schema.fqn,
        schemaName: schema.name,
        tableNames: schema.tables.map((t) => t.name),
        insights,
        recordedAt: new Date().toISOString(),
      });
      if (phase === "post") {
        return NextResponse.json({
          ok: true,
          wantId,
          delta: { score: delta.score, focus: delta.focus, hints: delta.hints },
        });
      }
    }

    // 2) AWARD (deposit lands on devnet)
    let deal = getDeal(wantId!);
    if (!deal || deal.state === "open") {
      const awarded = await award(wantId!);
      deal = awarded.deal;
      if (phase === "award") {
        return NextResponse.json({ ok: true, wantId, deal });
      }
    }

    // 3) DELIVER (mock — use canned audio + episode, commit its hash on-chain)
    //    Only advance when deliver is explicitly requested ("deliver" or "all").
    //    Previously this ran whenever the deal was 'deposited', which meant a
    //    direct phase:"release" call auto-delivered and then released — breaking
    //    the "cannot release before deliver" invariant.
    if ((phase === "deliver" || phase === "all") && deal.state === "deposited") {
      const audio = await getDemoAudio(fixtureId);
      const episode = await getDemoEpisode(fixtureId);
      const audioHash = sha256(audio).hex;
      const episodeId = `demo_${wantId}_${audioHash.slice(0, 12)}`;
      const delivered = await deliver({
        wantId: wantId!,
        manifest: {
          episodeId,
          schemaFqn: schema.fqn,
          personaId: deal.personaId,
          audioSha256: audioHash,
          generatedAt: episode.generatedAt ?? new Date().toISOString(),
        },
      });
      deal = delivered.deal;
      if (phase === "deliver") {
        return NextResponse.json({
          ok: true,
          wantId,
          deal,
          audio: audio.toString("base64"),
          episode,
          manifestHashHex: delivered.manifestHashHex,
        });
      }
    }

    // 4) RELEASE (only when explicitly requested, or as part of "all")
    if ((phase === "release" || phase === "all") && deal.state === "delivered") {
      const released = await releaseDeal(wantId!);
      deal = released.deal;
    }

    // Return the completed cycle
    const audio = await getDemoAudio(fixtureId);
    const episode = await getDemoEpisode(fixtureId);
    return NextResponse.json({
      ok: true,
      wantId,
      deal,
      audio: audio.toString("base64"),
      episode,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
