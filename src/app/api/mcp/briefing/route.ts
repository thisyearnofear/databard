import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@okxweb3/x402-next";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { generateScript } from "@/lib/script-generator";
import { synthesizeEpisode } from "@/lib/audio-engine";
import { analyzeSchema, generateActionItems } from "@/lib/schema-analysis";
import { buildResearchTrail } from "@/lib/research";
import { buildEvidenceContext, enrichResearchTrail } from "@/lib/evidence-providers";
import { getDuneTableStats } from "@/lib/dune-adapter";
import { parseMcpInput } from "@/lib/mcp";
import { fetchSchemaMetaLenient } from "@/lib/mcp-demo";
import { getMonidCost } from "@/lib/monid-adapter";
import { uploadEpisodeToGrove } from "@/lib/grove-storage";
import type { Episode } from "@/lib/types";
import { ValidationError } from "@/lib/validation";
import { x402Server, briefingRouteConfig, x402Configured } from "@/lib/x402";

export const runtime = "nodejs";

/**
 * A2MCP tool — `databard_briefing` (PAID, x402 pay-per-call).
 *
 * Full AI data-analyst synthesis, one-shot: fetch metadata → analyse → build
 * research trail → generate script → synthesise audio → upload to Grove.
 * Returns the script, audio (base64 MP3 + Grove URL), health score, critical
 * tables, and prioritised recommended actions.
 *
 * Wrapped with `withX402`: a call with no/invalid payment returns 402 (the
 * `PAYMENT-REQUIRED` header carries the base64 x402 challenge — an `exact`
 * EIP-3009 USDT0 transfer on X Layer). After the caller pays and replays with
 * `X-PAYMENT`, the facilitator verifies the signature; settlement only happens
 * AFTER this handler returns a <400 response, so a failed synthesis never
 * charges the caller.
 *
 * Self-check (must return HTTP 402 + PAYMENT-REQUIRED header):
 *   curl -i -X POST https://databard.persidian.com/api/mcp/briefing \
 *     -H 'content-type: application/json' \
 *     -d '{"source":"openmetadata","schemaFqn":"db.sales","openmetadata":{"url":"...","token":"..."}}'
 */
async function briefingHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // A non-JSON or empty body still gets a (demo) briefing — never a 400/500.
    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const { config, schemaFqn, researchQuestion, outputFormat, forceDemo, audio: audioMode } = parseMcpInput(body);

    // Degrade to the labelled demo fixture when the source is unreachable —
    // marketplace reviewers have no credentials, and a 400 after payment is
    // exactly what failed the first OKX listing review.
    const { meta, demo, connectionNotice } = await fetchSchemaMetaLenient(config, schemaFqn, { forceDemo });
    const insights = analyzeSchema(meta);
    const researchTrail = await enrichResearchTrail(
      buildResearchTrail(meta, insights, researchQuestion),
      buildEvidenceContext(config)
    );
    const tableStats = config.source === "dune" ? getDuneTableStats(schemaFqn) : undefined;
    // Monid data reach is metered — carry the measured cost into the paid briefing
    // so the receipt sits next to the x402 price the caller just paid.
    const monidCost = config.source === "monid" ? getMonidCost(schemaFqn) : undefined;

    const script = await generateScript(meta, {
      researchQuestion,
      researchTrail,
      tableStats,
      source: config.source,
      format: outputFormat,
    });

    // Audio is optional: "none" skips TTS entirely (fastest, text-only briefing),
    // "url" returns a Grove link with inline base64 as fallback, "inline" (default)
    // returns base64 MP3. LLM callers should prefer "url" or "none" — an inline
    // MP3 is unreadable context to a model.
    const audioModeResolved = audioMode;
    let audio: Buffer | undefined;
    if (audioModeResolved !== "none") {
      let audioBuffers: Buffer[];
      try {
        audioBuffers = await synthesizeEpisode(script);
      } catch (apiError: unknown) {
        const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
        // Free-tier TTS 402 → web-automation fallback (same as /api/synthesize).
        if (
          errorMsg.includes("402") ||
          errorMsg.includes("payment_required") ||
          errorMsg.includes("paid_plan_required")
        ) {
          const { synthesizeEpisodeViaWeb } = await import("@/lib/audio-engine-providers");
          audioBuffers = await synthesizeEpisodeViaWeb(script);
        } else {
          throw apiError;
        }
      }
      audio = Buffer.concat(audioBuffers);
    }

    const episode: Episode = {
      schemaFqn,
      schemaName: meta.name,
      researchQuestion,
      researchTrail,
      tableCount: meta.tables.length,
      qualitySummary: {
        passed: insights.passingTests,
        failed: insights.failingTests,
        total: insights.totalTests,
      },
      healthScore: insights.healthScore,
      script,
    };

    // Non-fatal: deliver the audio regardless; the URL is a bonus.
    let audioUrl: string | undefined;
    if (audio) {
      try {
        const grove = await uploadEpisodeToGrove(episode, audio);
        audioUrl = grove.audioUrl;
      } catch (groveErr) {
        console.warn("[MCP briefing] Grove upload failed (non-fatal):", groveErr);
      }
    }

    const actions = generateActionItems(insights);

    // Agent-first payload: a quotable plain-text summary + machine-readable
    // key findings. The calling LLM relays these verbatim; the script and
    // audio are the depth layer for its human.
    const topAction = actions[0];
    const summary =
      `${meta.name} scores ${insights.healthScore}/100 (${insights.healthLabel}). ` +
      `${insights.failingTests} failing test${insights.failingTests === 1 ? "" : "s"} ` +
      `across ${meta.tables.length} tables` +
      (insights.criticalTables.length
        ? `; highest-risk table: ${insights.criticalTables[0].table.name} (${insights.criticalTables[0].downstreamCount} downstream dependents)`
        : "") +
      (topAction ? `. Most urgent next step: ${topAction.title}.` : ".");
    const keyFindings = [
      `Health score ${insights.healthScore}/100 — ${insights.healthLabel}`,
      `${insights.failingTests} failing / ${insights.totalTests} total quality tests (coverage ${insights.testCoverage}%)`,
      `${insights.staleTables} stale tables, doc coverage ${insights.docCoverage}%`,
      ...insights.criticalTables.slice(0, 2).map(
        (ct) => `Critical table ${ct.table.name}: ${ct.failingTests} failing tests, ${ct.downstreamCount} downstream dependents`
      ),
    ].slice(0, 5);

    return NextResponse.json({
      ok: true,
      tool: "databard.briefing",
      serviceVersion: 2,
      generatedAt: new Date().toISOString(),
      schemaFqn,
      schemaName: meta.name,
      ...(demo ? { demo: true, connectionNotice } : {}),
      researchQuestion,
      outputFormat,
      health: {
        score: insights.healthScore,
        label: insights.healthLabel,
        failingTests: insights.failingTests,
        testCoverage: insights.testCoverage,
        docCoverage: insights.docCoverage,
      },
      criticalTables: insights.criticalTables.slice(0, 5).map((ct) => ({
        name: ct.table.name,
        failingTests: ct.failingTests,
        downstreamCount: ct.downstreamCount,
        risk: ct.risk,
      })),
      recommendedActions: actions.slice(0, 10).map((a) => ({
        priority: a.priority,
        category: a.category,
        title: a.title,
        description: a.description,
        table: a.table,
        effort: a.effort,
      })),
      summary,
      keyFindings,
      ...(topAction ? { nextStep: topAction.title } : {}),
      script: script.map((s) => ({
        speaker: s.speaker,
        topic: s.topic,
        text: s.text,
      })),
      audioDelivery: audioModeResolved,
      ...(audio ? { audio: audio.toString("base64"), audioFormat: "mp3" } : { audio: null, audioFormat: null }),
      audioUrl,
      ...(monidCost ? { monidCost } : {}),
    });
  } catch (e) {
    if (e instanceof ValidationError) {
      // 400 → withX402 skips settlement, caller is not charged.
      // (Rare: parseMcpInput is lenient, but keep a guard for the impossible.)
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    // 500 → withX402 skips settlement, caller is not charged.
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// When x402 credentials are present, gate the handler behind payment.
// Otherwise surface a loud 503 so the deploy is obviously not ready to list.
export const POST: (req: NextRequest) => Promise<NextResponse> =
  x402Configured && x402Server
    ? withX402(briefingHandler, briefingRouteConfig, x402Server)
    : async () =>
        NextResponse.json(
          {
            ok: false,
            error:
              "x402 payment not configured. Set PAY_TO_ADDRESS, OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE to enable the paid Data Briefing endpoint.",
          },
          { status: 503 }
        );
