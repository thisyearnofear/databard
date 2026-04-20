import { NextRequest, NextResponse } from "next/server";
import { isPaperAvailable, renderHealthDashboard } from "@/lib/paper-canvas";
import { analyzeSchema, generateActionItems } from "@/lib/schema-analysis";
import { shares } from "@/lib/store";
import type { Episode } from "@/lib/types";

/**
 * Render a schema health dashboard to the Paper canvas.
 * POST /api/canvas
 * Body: { episodeId } — renders from a shared episode
 *   or: { episode } — renders from inline episode data
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Get episode data
    let episode: Episode | null = null;
    if (body.episodeId) {
      episode = shares.get<Episode>(body.episodeId);
      if (!episode) return NextResponse.json({ ok: false, error: "Episode not found" }, { status: 404 });
    } else if (body.episode) {
      episode = body.episode;
    } else {
      return NextResponse.json({ ok: false, error: "episodeId or episode required" }, { status: 400 });
    }

    if (!episode!.schemaMeta) {
      return NextResponse.json({ ok: false, error: "Episode has no schema metadata" }, { status: 400 });
    }

    // Check Paper availability
    const available = await isPaperAvailable();
    if (!available) {
      return NextResponse.json({ ok: false, error: "Paper Desktop not running. Open Paper with a file to enable canvas rendering." }, { status: 503 });
    }

    // Generate insights and render
    const insights = analyzeSchema(episode!.schemaMeta!);
    const actionItems = generateActionItems(insights);
    const result = await renderHealthDashboard(episode!, insights, actionItems);

    return NextResponse.json({ ok: true, artboardId: result.artboardId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** Check if Paper is available */
export async function GET() {
  const available = await isPaperAvailable();
  return NextResponse.json({ ok: true, available });
}
