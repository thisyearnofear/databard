import { NextRequest, NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import type { Episode } from "@/lib/types";

/**
 * Share endpoint — stores episode data and returns a shareable ID.
 * Episodes are cached for 24 hours.
 */
export async function POST(req: NextRequest) {
  try {
    const episode: Episode = await req.json();
    
    // Generate unique ID
    const id = Math.random().toString(36).substring(2, 10);
    const shareKey = `share:${id}`;
    
    // Store episode (24 hour TTL)
    cache.set(shareKey, episode, 86400);
    
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
  
  const shareKey = `share:${id}`;
  const episode = cache.get<Episode>(shareKey);
  
  if (!episode) {
    return NextResponse.json({ ok: false, error: "Episode not found or expired" }, { status: 404 });
  }
  
  return NextResponse.json({ ok: true, episode });
}
