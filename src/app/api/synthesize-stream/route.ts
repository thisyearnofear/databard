import { NextRequest, NextResponse } from "next/server";
import { generateScript } from "@/lib/script-generator";
import { synthesizeSpeech, synthesizeSfx } from "@/lib/audio-engine";
import type { ConnectionConfig } from "@/lib/types";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { validateSchemaFqn, ValidationError } from "@/lib/validation";

/**
 * Streaming synthesis — sends audio chunks as they're generated.
 * Client can start playback immediately instead of waiting for full episode.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { schemaFqn, source = "openmetadata" } = body;

    // Validate input early
    validateSchemaFqn(schemaFqn);

    const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Build connection config
        const config: ConnectionConfig = {
          source: source as ConnectionConfig["source"],
          openmetadata: body.url && body.token ? { url: body.url, token: body.token } : undefined,
          dbtCloud: body.dbtCloud,
          dbtLocal: body.dbtLocal,
        };

        // Fetch metadata and generate script
        const meta = await fetchSchemaMeta(config, schemaFqn);
        const script = await generateScript(meta);

        // Send metadata header
        const totalTests = meta.tables.reduce((n, t) => n + t.qualityTests.length, 0);
        const failedTests = meta.tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Failed").length, 0);
        
        const header = JSON.stringify({
          type: "metadata",
          schemaFqn: meta.fqn,
          schemaName: meta.name,
          tableCount: meta.tables.length,
          testsTotal: totalTests,
          testsFailed: failedTests,
          script,
        });
        controller.enqueue(encoder.encode(`data: ${header}\n\n`));

        // Intro jingle
        const intro = await synthesizeSfx("podcast intro jingle, upbeat tech vibes, short", 3);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "audio", data: intro.toString("base64") })}\n\n`));

        // Synthesize segments with streaming
        for (let i = 0; i < script.length; i++) {
          const prev = i > 0 ? script[i - 1].text : undefined;
          const next = i < script.length - 1 ? script[i + 1].text : undefined;

          // Transition sound between topics
          if (i > 0 && script[i].topic !== script[i - 1].topic) {
            const transition = await synthesizeSfx("short subtle whoosh transition sound", 1);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "audio", data: transition.toString("base64") })}\n\n`));
          }

          // Speech segment
          const audio = await synthesizeSpeech(script[i], prev, next);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "audio", data: audio.toString("base64"), segment: i })}\n\n`));
        }

        // Outro
        const outro = await synthesizeSfx("podcast outro jingle, mellow fade out, short", 3);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "audio", data: outro.toString("base64") })}\n\n`));

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      } catch (e: unknown) {
        const msg = e instanceof ValidationError
          ? e.message
          : e instanceof Error
          ? e.message
          : "Unknown error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
