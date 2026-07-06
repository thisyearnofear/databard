import { NextRequest, NextResponse } from "next/server";
import { getLatestSnapshot } from "@/lib/schema-snapshots";
import { getTeamHistory } from "@/lib/mint-stats";

/**
 * GET /api/badge/{schema} — shields-style SVG health badge for READMEs and docs.
 *
 *   ![Data Health](https://databard.persidian.com/api/badge/analytics.ecommerce)
 *
 * Score comes from the latest engine snapshot, falling back to the latest
 * Solana mint (marked ⛓ verified). Every embedded badge is a live backlink.
 */

function badgeColor(score: number): string {
  return score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
}

function renderBadge(label: string, value: string, color: string): string {
  const charW = 6.5;
  const pad = 10;
  const labelW = Math.ceil(label.length * charW) + pad * 2;
  const valueW = Math.ceil(value.length * charW) + pad * 2;
  const total = labelW + valueW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${valueW}" height="20" fill="${color}"/>
    <rect width="${total}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelW / 2}" y="14">${label}</text>
    <text x="${labelW + valueW / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ schema: string }> }) {
  try {
    const { schema } = await params;
    const name = decodeURIComponent(schema);

    const snapshot = getLatestSnapshot(name);
    let score: number | null = snapshot ? snapshot.insights.healthScore : null;
    let verified = false;

    if (score === null) {
      const mints = await getTeamHistory(name);
      if (mints.length > 0) {
        score = mints[0].healthScore;
        verified = true;
      }
    }

    const svg = score === null
      ? renderBadge("data health", "not indexed", "#9ca3af")
      : renderBadge("data health", `${score}%${verified ? " ⛓" : ""}`, badgeColor(score));

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
