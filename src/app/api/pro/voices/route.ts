/**
 * GET/POST /api/pro/voices
 * Read or update the host voice configuration.
 * POST body: { alex?: string, morgan?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getVoiceConfig, updateVoiceConfig, VOICE_PRESETS } from "@/lib/voice-config";

export async function GET() {
  const config = getVoiceConfig();
  return NextResponse.json({
    ok: true,
    voices: config,
    presets: VOICE_PRESETS,
    current: {
      alex: VOICE_PRESETS.find((v) => v.id === config.alex) ?? null,
      morgan: VOICE_PRESETS.find((v) => v.id === config.morgan) ?? null,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    updateVoiceConfig(body);
    const config = getVoiceConfig();
    return NextResponse.json({ ok: true, voices: config });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
