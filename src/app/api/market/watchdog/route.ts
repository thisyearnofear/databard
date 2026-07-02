/**
 * POST /api/market/watchdog — Watchdog tick.
 *
 * Fetches a schema, computes delta vs. last snapshot, and posts a WANT if the delta exceeds
 * the threshold. Optionally runs the full market cycle end-to-end (`autoDrive: true`).
 *
 * Body:
 *   schemaFqn:      string
 *   connectionConfig: ConnectionConfig
 *   budgetLamports?: number     (default: 0.05 SOL)
 *   deadlineSec?:   number     (default: 300)
 *   deltaThreshold?: number    (default: DEFAULT_DELTA_THRESHOLD)
 *   autoDrive?:     boolean    (default: false — drives award + deliver + release automatically)
 *
 * Returns { ok, tick, deal?, releaseTxSig? }.
 *
 * This is the endpoint a Vercel Cron / external scheduler / demo script points at. It replaces
 * a plain regenerate call for schedules that opt in to the market path.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { tick, DEFAULT_DELTA_THRESHOLD } from "@/lib/market/watchdog";
import { award, deliver, releaseDeal } from "@/lib/market/orchestrator";
import { getWatchdogKeypair, sha256 } from "@/lib/settlement/backends/escrow";
import { generateScript } from "@/lib/script-generator";
import { synthesizeEpisode } from "@/lib/audio-engine";
import { analyzeSchema } from "@/lib/schema-analysis";
import { buildResearchTrail } from "@/lib/research";
import { buildEvidenceContext, enrichResearchTrail } from "@/lib/evidence-providers";
import { uploadEpisodeToGrove } from "@/lib/grove-storage";
import { getVoiceConfigForPersona } from "@/lib/voice-config";
import type { ConnectionConfig, Episode } from "@/lib/types";
import { getDeal } from "@/lib/market/protocol";

const DEFAULT_BUDGET_LAMPORTS = 50_000_000; // 0.05 SOL

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      schemaFqn,
      connectionConfig,
      budgetLamports = DEFAULT_BUDGET_LAMPORTS,
      deadlineSec = 300,
      deltaThreshold = DEFAULT_DELTA_THRESHOLD,
      autoDrive = false,
    } = body as {
      schemaFqn?: string;
      connectionConfig?: ConnectionConfig;
      budgetLamports?: number;
      deadlineSec?: number;
      deltaThreshold?: number;
      autoDrive?: boolean;
    };

    if (!schemaFqn || !connectionConfig) {
      return NextResponse.json(
        { ok: false, error: "schemaFqn and connectionConfig required" },
        { status: 400 },
      );
    }

    // 1. Fetch the current schema and run the Watchdog tick.
    const schema = await fetchSchemaMeta(connectionConfig, schemaFqn);
    const buyerPk = getWatchdogKeypair().publicKey.toBase58();
    const tickResult = tick({
      schema,
      buyerWalletAddress: buyerPk,
      budgetLamports,
      deadlineSec,
      deltaThreshold,
    });

    if (!tickResult.posted || !autoDrive) {
      return NextResponse.json({ ok: true, tick: tickResult });
    }

    // 2. autoDrive: award → deliver → release, running server-side end-to-end.
    const wantId = tickResult.want!.id;
    const { deal } = await award(wantId);

    const insights = analyzeSchema(schema);
    const question = `${deal.want.focus} brief on ${schema.name}`;
    const researchTrail = await enrichResearchTrail(
      buildResearchTrail(schema, insights, question),
      buildEvidenceContext(connectionConfig),
    );
    const script = await generateScript(schema, {
      researchQuestion: question,
      researchTrail,
      source: connectionConfig.source,
    });
    const voices = getVoiceConfigForPersona(deal.personaId);
    const audioBuffers = await synthesizeEpisode(script, voices);
    const combined = Buffer.concat(audioBuffers);
    const audioHash = sha256(combined).hex;

    const episode: Episode = {
      schemaFqn,
      schemaName: schema.name,
      researchQuestion: question,
      researchTrail,
      tableCount: schema.tables.length,
      qualitySummary: { passed: insights.passingTests, failed: insights.failingTests, total: insights.totalTests },
      script,
      schemaMeta: schema,
      generatedAt: new Date().toISOString(),
    };
    let grove: { audioUrl?: string } = {};
    try {
      grove = await uploadEpisodeToGrove(episode, combined);
    } catch (err) {
      console.warn("[Watchdog] Grove upload failed (non-fatal):", err);
    }

    const episodeId = `${wantId}_${audioHash.slice(0, 12)}`;
    await deliver({
      wantId,
      manifest: {
        episodeId,
        schemaFqn,
        personaId: deal.personaId,
        audioUrl: grove.audioUrl,
        audioSha256: audioHash,
        generatedAt: episode.generatedAt!,
      },
    });

    const { releaseTxSig } = await releaseDeal(wantId);
    const finalDeal = getDeal(wantId);

    return NextResponse.json({
      ok: true,
      tick: tickResult,
      deal: finalDeal,
      releaseTxSig,
      episode: { ...episode, audioUrl: grove.audioUrl },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
