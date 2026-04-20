import { NextRequest, NextResponse } from "next/server";
import { shares } from "@/lib/store";
import type { Episode } from "@/lib/types";

interface SharedEpisode extends Episode {
  audioBase64?: string;
}

/**
 * Share endpoint — stores episode + audio data, returns a shareable ID.
 * Episodes cached for 24 hours on disk.
 */
export async function POST(req: NextRequest) {
  try {
    const body: SharedEpisode = await req.json();
    const id = Math.random().toString(36).substring(2, 10);
    shares.set(id, body, 86400);
    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * Retrieve shared episode by ID.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id parameter" }, { status: 400 });
  }

  const meta = shares.getMeta<SharedEpisode>(id);
  if (!meta) {
    return NextResponse.json({ ok: false, error: "Episode not found or expired" }, { status: 404 });
  }

  // Include expiry info so the client can display it
  const expiresIn = Math.max(0, Math.round((meta.expiresAt - Date.now()) / 1000));

  return NextResponse.json({ ok: true, episode: meta.data, expiresIn });
}
