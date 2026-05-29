/**
 * GET /api/graduation
 * Returns Coral source graduation candidates (sources that have crossed
 * the usage threshold) and all tracked sources sorted by popularity.
 * Admin-only diagnostic endpoint — not exposed in public UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTrackedSources, getGraduationCandidates, GRADUATION_THRESHOLD } from "@/lib/coral-graduation";

export async function GET(req: NextRequest) {
  try {
    const format = req.nextUrl.searchParams.get("format");
    const candidates = await getGraduationCandidates();
    const allSources = await getTrackedSources();

    if (format === "markdown") {
      // Machine-readable markdown for the AGENTS.md / spec output
      const lines = [
        "# Coral Graduation Pipeline",
        "",
        `Threshold: **${GRADUATION_THRESHOLD}** requests`,
        "",
        "## Graduation candidates",
        "",
        ...(candidates.length
          ? candidates.map((s) => `- **${s.source}** — ${s.requestCount} requests (${s.firstSeenAt.slice(0, 10)} → ${s.lastSeenAt.slice(0, 10)})`)
          : ["_None yet — no source has crossed the threshold_"]),
        "",
        "## All tracked sources",
        "",
        ...(allSources.length
          ? allSources.map((s) => `- \`${s.source}\` — ${s.requestCount} req${s.requestCount === 1 ? "" : "s"} ${s.flagged ? "⚠️ FLAGGED" : ""}`)
          : ["_No Coral usage recorded yet_"]),
        "",
      ];
      return new NextResponse(lines.join("\n"), {
        headers: { "Content-Type": "text/markdown" },
      });
    }

    return NextResponse.json({
      ok: true,
      threshold: GRADUATION_THRESHOLD,
      candidates: candidates.map((s) => ({
        source: s.source,
        requestCount: s.requestCount,
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.lastSeenAt,
      })),
      allSources: allSources.map((s) => ({
        source: s.source,
        requestCount: s.requestCount,
        flagged: s.flagged,
      })),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
