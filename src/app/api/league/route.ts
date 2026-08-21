import { NextResponse } from "next/server";
import { buildLeagueEdition } from "@/lib/league";

/**
 * GET /api/league — current weekly protocol-health accounting.
 * Public. The JSON is what the /league page and OG image both render,
 * so a tweet/email unfurl and a curl get the same edition.
 */
export async function GET() {
  try {
    const edition = buildLeagueEdition();
    return NextResponse.json({ ok: true, edition });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
