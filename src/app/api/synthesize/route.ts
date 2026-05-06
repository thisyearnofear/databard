import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { generateScript } from "@/lib/script-generator";
import { synthesizeEpisode } from "@/lib/audio-engine";
import type { ConnectionConfig, ScriptSegment } from "@/lib/types";
import { buildResearchTrail } from "@/lib/research";
import { buildEvidenceContext, enrichResearchTrail } from "@/lib/evidence-providers";
import { analyzeSchema } from "@/lib/schema-analysis";
import { ValidationError, guardMutation, validateResearchQuestion } from "@/lib/validation";
import { getDuneTableStats } from "@/lib/dune-adapter";

/**
 * Full pipeline: metadata → script → audio.
 * Also accepts a raw `script` array for demo mode (skips metadata fetch).
 * Returns JSON with base64 audio.
 * 
 * Falls back to web UI automation if API returns 402 (free tier limitation).
 */
export async function POST(req: NextRequest) {
  try {
    guardMutation(req);

    const body = await req.json();

    let script: ScriptSegment[];

    if (body.script) {
      // Demo mode — script provided directly
      script = body.script;
    } else {
      // Normal mode — fetch metadata and generate script
      const { schemaFqn, source = "openmetadata", researchQuestion } = body;
      const normalizedResearchQuestion = typeof researchQuestion === "string" && researchQuestion.trim()
        ? researchQuestion.trim()
        : undefined;
      if (normalizedResearchQuestion) {
        validateResearchQuestion(normalizedResearchQuestion);
      }
      const config: ConnectionConfig = {
        source,
        openmetadata: body.url && body.token ? { url: body.url, token: body.token } : undefined,
        dbtCloud: body.dbtCloud,
        dbtLocal: body.dbtLocal,
        theGraph: body.theGraph,
        dune: body.dune,
      };
      const meta = await fetchSchemaMeta(config, schemaFqn);
      const insights = analyzeSchema(meta);
      const researchTrail = await enrichResearchTrail(
        buildResearchTrail(meta, insights, normalizedResearchQuestion),
        buildEvidenceContext(config)
      );
      const tableStats = source === "dune" ? getDuneTableStats(schemaFqn) : undefined;
      script = await generateScript(meta, { researchQuestion: normalizedResearchQuestion, researchTrail, tableStats });
    }

    let audioBuffers: Buffer[];
    
    try {
      // Try API first
      audioBuffers = await synthesizeEpisode(script);
    } catch (apiError: unknown) {
      const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
      
      // If 402 error (free tier), try web automation fallback
      if (errorMsg.includes('402') || errorMsg.includes('payment_required') || errorMsg.includes('paid_plan_required')) {
        console.log('[Synthesis] API returned 402, trying web automation...');
        try {
          const { synthesizeEpisodeViaWeb } = await import("@/lib/audio-engine-providers");
          audioBuffers = await synthesizeEpisodeViaWeb(script);
        } catch {
          throw apiError; // web fallback also failed — throw original
        }
      } else {
        throw apiError;
      }
    }
    
    const combined = Buffer.concat(audioBuffers);

    return NextResponse.json({ ok: true, audio: combined.toString("base64") });
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.message.includes("Unauthorized") ? 401 : 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
