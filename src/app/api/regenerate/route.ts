import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { generateScript } from "@/lib/script-generator";
import { synthesizeEpisode } from "@/lib/audio-engine";
import { shares, feedStore } from "@/lib/store";
import { buildResearchTrail } from "@/lib/research";
import { appendResearchBranch, createResearchSession, linkEpisodeToSession } from "@/lib/research-session";
import { buildEvidenceContext, enrichResearchTrail } from "@/lib/evidence-providers";
import { ValidationError, guardMutation, validateResearchQuestion } from "@/lib/validation";
import { analyzeSchema, diffInsights } from "@/lib/schema-analysis";
import type { ConnectionConfig, Episode } from "@/lib/types";

/**
 * Regeneration endpoint — generates a fresh episode from a saved config.
 * Designed to be called by Vercel Cron, GitHub Actions, or any scheduler.
 *
 * POST /api/regenerate
 * Body: { schemaFqn, source, url?, token?, dbtCloud?, dbtLocal?, shareId? }
 *
 * If shareId is provided, updates the existing shared episode in-place.
 * Otherwise creates a new shared episode and returns the ID.
 */
export async function POST(req: NextRequest) {
  try {
    guardMutation(req);

    const body = await req.json();
    const { schemaFqn, source = "openmetadata", shareId, researchQuestion } = body;

    if (!schemaFqn) {
      return NextResponse.json({ ok: false, error: "schemaFqn required" }, { status: 400 });
    }

    const previousResearchQuestion = shareId ? shares.get<Episode>(shareId)?.researchQuestion : undefined;
    const previousResearchSessionId = shareId ? shares.get<Episode>(shareId)?.researchSessionId : undefined;
    const effectiveResearchQuestion = typeof researchQuestion === "string" && researchQuestion.trim()
      ? researchQuestion.trim()
      : previousResearchQuestion;

    if (typeof effectiveResearchQuestion === "string" && effectiveResearchQuestion.trim()) {
      validateResearchQuestion(effectiveResearchQuestion);
    }

    const config: ConnectionConfig = {
      source,
      openmetadata: body.url && body.token ? { url: body.url, token: body.token } : undefined,
      dbtCloud: body.dbtCloud,
      dbtLocal: body.dbtLocal,
      theGraph: body.theGraph,
      dune: body.dune,
    };

    // Full pipeline: fetch → analyze → diff → script → synthesize
    const meta = await fetchSchemaMeta(config, schemaFqn);
    const insights = analyzeSchema(meta);
    const evidenceContext = buildEvidenceContext(config);
    const researchTrail = await enrichResearchTrail(buildResearchTrail(meta, insights, effectiveResearchQuestion), evidenceContext);

    const createdResearchSession = effectiveResearchQuestion && !previousResearchSessionId
      ? createResearchSession({
          schemaMeta: meta,
          source,
          question: effectiveResearchQuestion,
          trail: researchTrail,
          evidenceContext,
        })
      : null;

    // Change detection: compare against previous episode if shareId provided
    let diff: ReturnType<typeof diffInsights> | undefined;
    if (shareId) {
      const prevEpisode = shares.get<Episode>(shareId);
      if (prevEpisode?.schemaMeta) {
        const prevInsights = analyzeSchema(prevEpisode.schemaMeta);
        const prevTableNames = prevEpisode.schemaMeta.tables.map((t) => t.name);
        const currTableNames = meta.tables.map((t) => t.name);
        diff = diffInsights(prevInsights, insights, prevTableNames, currTableNames);
      }
    }

    const script = await generateScript(meta, { researchQuestion: typeof effectiveResearchQuestion === "string" ? effectiveResearchQuestion : undefined, researchTrail });
    const audioBuffers = await synthesizeEpisode(script);
    const combined = Buffer.concat(audioBuffers);

    const totalTests = meta.tables.reduce((n, t) => n + t.qualityTests.length, 0);
    const failedTests = meta.tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Failed").length, 0);

    const episode: Episode & { audioBase64: string } = {
      schemaFqn: meta.fqn,
      schemaName: meta.name,
      researchQuestion: typeof effectiveResearchQuestion === "string" ? effectiveResearchQuestion.trim() : undefined,
      researchSessionId: previousResearchSessionId ?? createdResearchSession?.id,
      tableCount: meta.tables.length,
      qualitySummary: { passed: totalTests - failedTests, failed: failedTests, total: totalTests },
      script,
      schemaMeta: meta,
      researchTrail,
      generatedAt: new Date().toISOString(),
      audioBase64: combined.toString("base64"),
    };

    // Store as shared episode
    const id = shareId ?? Math.random().toString(36).substring(2, 10);
    shares.set(id, episode, 86400 * 7); // 7 day TTL for scheduled episodes

    if (episode.researchSessionId) {
      if (previousResearchSessionId) {
        appendResearchBranch({
          sessionId: previousResearchSessionId,
          question: episode.researchQuestion ?? effectiveResearchQuestion ?? meta.name,
          trail: researchTrail,
          episodeId: id,
        });
      } else if (createdResearchSession) {
        linkEpisodeToSession(createdResearchSession.id, id);
      }
    }

    // Append to feed for RSS
    feedStore.append({
      id,
      schemaName: meta.name,
      generatedAt: new Date().toISOString(),
      tableCount: meta.tables.length,
      testsFailed: failedTests,
      testsTotal: totalTests,
    });

    // Webhook notification
    const webhookUrl = process.env.DATABARD_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "episode.generated",
          schema: meta.name,
          tableCount: meta.tables.length,
          testsTotal: totalTests,
          testsFailed: failedTests,
          diff: diff ? { summary: diff.summary, newFailures: diff.newFailures, resolvedFailures: diff.resolvedFailures, healthScoreChange: diff.healthScoreChange } : undefined,
          episodeUrl: `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/episode/${id}`,
          generatedAt: new Date().toISOString(),
        }),
      }).catch((e) => console.warn("[Webhook] Failed:", e));
    }

    return NextResponse.json({
      ok: true,
      id,
      schemaName: meta.name,
      tableCount: meta.tables.length,
      testsTotal: totalTests,
      testsFailed: failedTests,
      researchSessionId: episode.researchSessionId,
      segments: script.length,
      diff: diff ? { summary: diff.summary, newTables: diff.newTables, removedTables: diff.removedTables, newFailures: diff.newFailures, resolvedFailures: diff.resolvedFailures, healthScoreChange: diff.healthScoreChange } : undefined,
    });
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.message.includes("Unauthorized") ? 401 : 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
