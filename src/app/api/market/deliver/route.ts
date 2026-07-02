/**
 * POST /api/market/deliver — seller runs the pipeline and commits the manifest hash on-chain.
 *
 * Body: { wantId, connectionConfig?, researchQuestion? }
 *   connectionConfig: full source credentials (falls back to session config)
 *   researchQuestion: derived from the WANT if not provided
 *
 * Returns { ok, deal, manifestHashHex, commitTxSig, episode }.
 *
 * The seller here is the winning persona (auto-selected in the award step). The pipeline runs
 * exactly as it does for a paying human user — voice-config-for-persona is honored so the
 * episode is delivered in the persona's voice.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { generateScript } from "@/lib/script-generator";
import { synthesizeEpisode } from "@/lib/audio-engine";
import { analyzeSchema } from "@/lib/schema-analysis";
import { buildResearchTrail } from "@/lib/research";
import { buildEvidenceContext, enrichResearchTrail } from "@/lib/evidence-providers";
import { uploadEpisodeToGrove } from "@/lib/grove-storage";
import type { ConnectionConfig, Episode } from "@/lib/types";
import { getDeal } from "@/lib/market/protocol";
import { deliver } from "@/lib/market/orchestrator";
import { sha256 } from "@/lib/settlement/backends/escrow";
import { getVoiceConfigForPersona, getPersona } from "@/lib/voice-config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wantId, connectionConfig, researchQuestion } = body as {
      wantId?: string;
      connectionConfig?: ConnectionConfig;
      researchQuestion?: string;
    };

    if (!wantId) return NextResponse.json({ ok: false, error: "wantId required" }, { status: 400 });
    const deal = getDeal(wantId);
    if (!deal) return NextResponse.json({ ok: false, error: "deal not found" }, { status: 404 });
    if (deal.state !== "deposited") {
      return NextResponse.json({ ok: false, error: `deal is ${deal.state}, expected deposited` }, { status: 409 });
    }

    const persona = getPersona(deal.personaId);
    if (!persona) return NextResponse.json({ ok: false, error: `persona ${deal.personaId} not found` }, { status: 500 });

    // Run the same pipeline as /api/synthesize, in podcast mode.
    const config: ConnectionConfig = connectionConfig ?? {
      source: "openmetadata",
    };
    const meta = await fetchSchemaMeta(config, deal.want.schemaFqn);
    const insights = analyzeSchema(meta);
    const question = researchQuestion?.trim() || `${deal.want.focus} brief on ${meta.name}`;
    const researchTrail = await enrichResearchTrail(
      buildResearchTrail(meta, insights, question),
      buildEvidenceContext(config),
    );

    // Persona-aware voices threaded into TTS; script is persona-neutral for now.
    const voices = getVoiceConfigForPersona(deal.personaId);
    const script = await generateScript(meta, {
      researchQuestion: question,
      researchTrail,
      source: config.source,
    });

    const audioBuffers = await synthesizeEpisode(script, voices);
    const combined = Buffer.concat(audioBuffers);
    const audioHash = sha256(combined).hex;

    // Persist the episode alongside a matching Grove upload for shareability.
    const episode: Episode = {
      schemaFqn: deal.want.schemaFqn,
      schemaName: meta.name,
      researchQuestion: question,
      researchTrail,
      tableCount: meta.tables.length,
      qualitySummary: { passed: insights.passingTests, failed: insights.failingTests, total: insights.totalTests },
      script,
      schemaMeta: meta,
      generatedAt: new Date().toISOString(),
    };
    let grove: { audioUrl?: string; metadataUrl?: string; metadataCid?: string } = {};
    try {
      grove = await uploadEpisodeToGrove(episode, combined);
    } catch (err) {
      console.warn("[Deliver] Grove upload failed (non-fatal):", err);
    }

    const episodeId = `${deal.wantId}_${audioHash.slice(0, 12)}`;
    const manifest = {
      episodeId,
      schemaFqn: deal.want.schemaFqn,
      personaId: deal.personaId,
      audioUrl: grove.audioUrl,
      audioSha256: audioHash,
      generatedAt: episode.generatedAt!,
    };

    const { deal: updated, manifestHashHex, commitTxSig } = await deliver({ wantId, manifest });

    return NextResponse.json({
      ok: true,
      deal: updated,
      manifestHashHex,
      commitTxSig,
      episode: { ...episode, audioUrl: grove.audioUrl },
      audio: combined.toString("base64"),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
