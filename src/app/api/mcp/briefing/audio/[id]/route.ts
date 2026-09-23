import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDataPath } from "@/lib/data-dir";

export const runtime = "nodejs";

/**
 * Serves a briefing MP3 persisted by POST /api/mcp/briefing.
 * `id` is the sha256 of the audio — content-addressed, immutable.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!/^[a-f0-9]{64}$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid audio id" }, { status: 400 });
  }
  try {
    const audio = await readFile(path.join(getDataPath("briefing-audio"), `${id}.mp3`));
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Audio not found" }, { status: 404 });
  }
}
