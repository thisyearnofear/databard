import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaMeta } from "@/lib/openmetadata";
import { generateScript } from "@/lib/script-generator";
import { synthesizeEpisode } from "@/lib/audio-engine";

/**
 * Full pipeline: metadata → script → audio.
 * Returns a single mp3 blob (concatenated buffers).
 */
export async function POST(req: NextRequest) {
  const { url, token, schemaFqn } = await req.json();

  try {
    const meta = await fetchSchemaMeta({ url, token }, schemaFqn);
    const script = generateScript(meta);
    const audioBuffers = await synthesizeEpisode(script);

    // Concatenate all mp3 buffers into one response
    const combined = Buffer.concat(audioBuffers);

    const totalTests = meta.tables.reduce((n, t) => n + t.qualityTests.length, 0);
    const failedTests = meta.tables.reduce((n, t) => n + t.qualityTests.filter((q) => q.status === "Failed").length, 0);

    return new NextResponse(combined, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Episode-Schema": meta.fqn,
        "X-Episode-Tables": String(meta.tables.length),
        "X-Episode-Tests-Total": String(totalTests),
        "X-Episode-Tests-Failed": String(failedTests),
        "X-Episode-Script": Buffer.from(JSON.stringify(script)).toString("base64"),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
