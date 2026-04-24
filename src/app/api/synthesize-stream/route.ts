import { NextRequest, NextResponse } from "next/server";
import { generateScript } from "@/lib/script-generator";
import { synthesizeSpeech, synthesizeSfx, estimateCost } from "@/lib/audio-engine";
import type { ConnectionConfig } from "@/lib/types";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { buildResearchTrail } from "@/lib/research";
import { createResearchSession } from "@/lib/research-session";
import { buildEvidenceContext, enrichResearchTrail } from "@/lib/evidence-providers";
import { analyzeSchema } from "@/lib/schema-analysis";
import { validateSchemaFqn, ValidationError, guardMutation, validateResearchQuestion } from "@/lib/validation";
import { getSessionConfig } from "@/lib/session";

/**
 * Streaming synthesis — sends audio chunks as they're generated.
 * Flow: auth → rate limit → session config → metadata → script → audio chunks → done
 * Uses server-side session for credentials when available, falls back to request body.
 */
export async function POST(req: NextRequest) {
  try {
    guardMutation(req);

    const body = await req.json();
    const { schemaFqn, source = "openmetadata", researchQuestion } = body;
    validateSchemaFqn(schemaFqn);
    const normalizedResearchQuestion = typeof researchQuestion === "string" && researchQuestion.trim()
      ? researchQuestion.trim()
      : undefined;
    if (normalizedResearchQuestion) {
      validateResearchQuestion(normalizedResearchQuestion);
    }

    // Prefer session config (credentials stored server-side), fall back to body
    const sessionConfig = await getSessionConfig();

    const signal = req.signal;
    const encoder = new TextEncoder();

    function send(controller: ReadableStreamDefaultController, data: unknown) {
      if (signal.aborted) throw new Error("Client disconnected");
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const config: ConnectionConfig = sessionConfig ?? {
            source: source as ConnectionConfig["source"],
            openmetadata: body.url && body.token ? { url: body.url, token: body.token } : undefined,
            dbtCloud: body.dbtCloud,
            dbtLocal: body.dbtLocal,
            theGraph: body.theGraph,
            dune: body.dune,
          };

          // Fetch metadata and generate script
          const meta = await fetchSchemaMeta(config, schemaFqn);
          if (signal.aborted) { controller.close(); return; }

          const insights = analyzeSchema(meta);
          const evidenceContext = buildEvidenceContext(config);
          const researchTrail = await enrichResearchTrail(
            buildResearchTrail(meta, insights, normalizedResearchQuestion),
            evidenceContext
          );
          const researchSession = normalizedResearchQuestion
            ? createResearchSession({
                schemaMeta: meta,
                source: config.source,
                question: normalizedResearchQuestion,
                trail: researchTrail,
                evidenceContext,
              })
            : null;
          const script = await generateScript(meta, { researchQuestion: normalizedResearchQuestion, researchTrail });
          if (signal.aborted) { controller.close(); return; }

          // Send metadata
          const totalTests = meta.tables.reduce((n, t) => n + t.qualityTests.length, 0);
          const failedTests = meta.tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Failed").length, 0);

          send(controller, {
            type: "metadata",
            schemaFqn: meta.fqn,
            schemaName: meta.name,
            researchQuestion: normalizedResearchQuestion,
            tableCount: meta.tables.length,
            testsTotal: totalTests,
            testsFailed: failedTests,
            script,
            schemaMeta: meta,
            researchTrail,
            researchSessionId: researchSession?.id,
          });

          // Send cost estimate before synthesizing
          const estimate = estimateCost(script);
          send(controller, {
            type: "estimate",
            segments: estimate.segments,
            sfxCalls: estimate.sfxCalls,
            totalCalls: estimate.totalCalls,
          });

          // Intro jingle
          const intro = await synthesizeSfx("podcast intro jingle, upbeat tech vibes, short", 3);
          if (signal.aborted) { controller.close(); return; }
          send(controller, { type: "audio", data: intro.toString("base64") });

          // Synthesize segments
          for (let i = 0; i < script.length; i++) {
            if (signal.aborted) { controller.close(); return; }

            const prev = i > 0 ? script[i - 1].text : undefined;
            const next = i < script.length - 1 ? script[i + 1].text : undefined;

            if (i > 0 && script[i].topic !== script[i - 1].topic) {
              const transition = await synthesizeSfx("short subtle whoosh transition sound", 1);
              if (signal.aborted) { controller.close(); return; }
              send(controller, { type: "audio", data: transition.toString("base64") });
            }

            const audio = await synthesizeSpeech(script[i], prev, next);
            if (signal.aborted) { controller.close(); return; }
            send(controller, { type: "audio", data: audio.toString("base64"), segment: i });
          }

          // Outro
          const outro = await synthesizeSfx("podcast outro jingle, mellow fade out, short", 3);
          if (signal.aborted) { controller.close(); return; }
          send(controller, { type: "audio", data: outro.toString("base64") });

          send(controller, { type: "done" });
          controller.close();
        } catch (e: unknown) {
          if (signal.aborted) { controller.close(); return; }
          const msg = e instanceof Error ? e.message : "Unknown error";
          try {
            send(controller, { type: "error", error: msg });
          } catch {
            // Client already gone
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.message.includes("Unauthorized") ? 401 : 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
