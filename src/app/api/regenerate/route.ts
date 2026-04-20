import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { generateScript } from "@/lib/script-generator";
import { synthesizeEpisode } from "@/lib/audio-engine";
import { cache } from "@/lib/cache";
import { validateApiSecret, ValidationError } from "@/lib/validation";
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
    validateApiSecret(req);

    const body = await req.json();
    const { schemaFqn, source = "openmetadata", shareId } = body;

    if (!schemaFqn) {
      return NextResponse.json({ ok: false, error: "schemaFqn required" }, { status: 400 });
    }

    const config: ConnectionConfig = {
      source,
      openmetadata: body.url && body.token ? { url: body.url, token: body.token } : undefined,
      dbtCloud: body.dbtCloud,
      dbtLocal: body.dbtLocal,
    };

    // Full pipeline: fetch → analyze → script → synthesize
    const meta = await fetchSchemaMeta(config, schemaFqn);
    const script = await generateScript(meta);
    const audioBuffers = await synthesizeEpisode(script);
    const combined = Buffer.concat(audioBuffers);

    const totalTests = meta.tables.reduce((n, t) => n + t.qualityTests.length, 0);
    const failedTests = meta.tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Failed").length, 0);

    const episode: Episode & { audioBase64: string } = {
      schemaFqn: meta.fqn,
      schemaName: meta.name,
      tableCount: meta.tables.length,
      qualitySummary: { passed: totalTests - failedTests, failed: failedTests, total: totalTests },
      script,
      schemaMeta: meta,
      audioBase64: combined.toString("base64"),
    };

    // Store as shared episode
    const id = shareId ?? Math.random().toString(36).substring(2, 10);
    cache.set(`share:${id}`, episode, 86400 * 7); // 7 day TTL for scheduled episodes

    return NextResponse.json({
      ok: true,
      id,
      schemaName: meta.name,
      tableCount: meta.tables.length,
      testsTotal: totalTests,
      testsFailed: failedTests,
      segments: script.length,
    });
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.message.includes("Unauthorized") ? 401 : 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
