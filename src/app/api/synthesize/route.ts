import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/metadata-adapter";
import { generateScript } from "@/lib/script-generator";
import { synthesizeEpisode } from "@/lib/audio-engine";
import type { ConnectionConfig, ScriptSegment } from "@/lib/types";
import { validateApiSecret, ValidationError, rateLimit } from "@/lib/validation";

/**
 * Full pipeline: metadata → script → audio.
 * Also accepts a raw `script` array for demo mode (skips metadata fetch).
 * Returns JSON with base64 audio.
 */
export async function POST(req: NextRequest) {
  try {
    validateApiSecret(req);
    rateLimit(req);

    const body = await req.json();

    let script: ScriptSegment[];

    if (body.script) {
      // Demo mode — script provided directly
      script = body.script;
    } else {
      // Normal mode — fetch metadata and generate script
      const { schemaFqn, source = "openmetadata" } = body;
      const config: ConnectionConfig = {
        source,
        openmetadata: body.url && body.token ? { url: body.url, token: body.token } : undefined,
        dbtCloud: body.dbtCloud,
        dbtLocal: body.dbtLocal,
      };
      const meta = await fetchSchemaMeta(config, schemaFqn);
      script = await generateScript(meta);
    }

    const audioBuffers = await synthesizeEpisode(script);
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
