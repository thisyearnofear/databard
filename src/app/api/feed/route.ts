import { NextRequest } from "next/server";
import type { Episode } from "@/lib/types";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(process.cwd(), ".databard", "cache");

/**
 * RSS podcast feed. Supports public and private (token-gated) feeds.
 *
 * Public:  GET /api/feed
 * Private: GET /api/feed?token=your_team_token
 *
 * Set DATABARD_FEED_TOKEN env var to require authentication.
 * Without it, the feed is public (fine for demos).
 */
export async function GET(req: NextRequest) {
  // Token gating
  const requiredToken = process.env.DATABARD_FEED_TOKEN;
  if (requiredToken) {
    const provided = req.nextUrl.searchParams.get("token");
    if (provided !== requiredToken) {
      return new Response("Unauthorized — append ?token=your_team_token", { status: 401 });
    }
  }

  const baseUrl = req.nextUrl.origin;
  const episodes: { id: string; episode: Episode }[] = [];

  try {
    if (existsSync(CACHE_DIR)) {
      for (const file of readdirSync(CACHE_DIR)) {
        try {
          const raw = JSON.parse(readFileSync(join(CACHE_DIR, file), "utf-8"));
          if (raw.data && raw.expiresAt > Date.now()) {
            const key = Buffer.from(file.replace(".json", ""), "base64url").toString();
            if (key.startsWith("share:")) {
              episodes.push({ id: key.slice(6), episode: raw.data });
            }
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* cache not available */ }

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const items = episodes.map(({ id, episode: ep }) => `
    <item>
      <title>${esc(`🎙️ ${ep.schemaName} — ${ep.tableCount} tables, ${ep.qualitySummary.total} tests`)}</title>
      <description>${esc(`Podcast walkthrough of the ${ep.schemaName} schema. ${ep.qualitySummary.failed > 0 ? `${ep.qualitySummary.failed} failing tests.` : "All tests passing."}`)}</description>
      <link>${baseUrl}/episode/${id}</link>
      <guid isPermaLink="true">${baseUrl}/episode/${id}</guid>
    </item>`).join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>DataBard — Your Data Catalog Podcast</title>
    <description>AI-generated podcast episodes walking through your data schemas, quality tests, and lineage.</description>
    <link>${baseUrl}</link>
    <language>en</language>
    <itunes:author>DataBard</itunes:author>
    <itunes:category text="Technology" />
    ${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
