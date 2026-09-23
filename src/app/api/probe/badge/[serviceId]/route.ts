import { NextRequest, NextResponse } from "next/server";
import { getLatestIndex } from "@/lib/marketplace-index";
import { scoreTone, type ScoreTone } from "@/lib/product/score-tone";

/**
 * GET /api/probe/badge/{serviceId} — shields-style SVG badge for providers'
 * READMEs: "DataBard Probe | 86 · healthy".
 *
 *   ![DataBard Probe](https://databard.persidian.com/api/probe/badge/17306)
 *
 * Grey "not indexed" fallback for unknown serviceIds. Cached 10 minutes.
 */

/** White label text sits on this fill, so it is darker than the app's tokens. */
const BADGE_HEX: Record<ScoreTone, string> = {
  good: "#22c55e",
  warn: "#eab308",
  bad: "#ef4444",
};

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  try {
    const { serviceId } = await params;
    const index = await getLatestIndex();
    const svc = index?.services.find((s) => s.serviceId === serviceId);

    const svg = !svc
      ? renderBadge("DataBard Probe", "not indexed", "#9ca3af")
      : svc.status === "unverified" || svc.score === null
        ? renderBadge("DataBard Probe", "unverified", "#9ca3af")
        : renderBadge(
            "DataBard Probe",
            `${svc.score} · ${svc.status}`,
            BADGE_HEX[scoreTone(svc.score)],
          );

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
