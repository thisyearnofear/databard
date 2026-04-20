import { NextRequest } from "next/server";
import { cache } from "@/lib/cache";
import type { Episode } from "@/lib/types";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(process.cwd(), ".databard", "cache");

/**
 * RSS feed of all shared episodes — subscribe in any podcast app.
 * GET /api/feed
 */
export async function GET(req: NextRequest) {
  const baseUrl = req.nextUrl.origin;

  // Collect all shared episodes from cache
  const episodes: { id: string; episode: Episode }[] = [];
  try {
    if (existsSync(CACHE_DIR)) {
      for (const file of readdirSync(CACHE_DIR)) {
        try {
          const raw = JSON.parse(readFileSync(join(CACHE_DIR, file), "utf-8"));
          if (raw.data && raw.expiresAt > Date.now()) {
            const key = Buffer.from(file.replace(".json", ""), "base64url").toString();
            if (key.startsWith("share:")) {
              const id = key.replace("share:", "");
              episodes.push({ id, episode: raw.data });
            }
          }
        } catch { /* skip invalid */ }
      }
    }
  } catch { /* cache dir not available */ }

  const items = episodes.map(({ id, episode: ep }) => `
    <item>
      <title>🎙️ ${escXml(ep.schemaName)} — ${ep.tableCount} tables, ${ep.qualitySummary.total} tests</title>
      <description>${escXml(`Podcast walkthrough of the ${ep.schemaName} schema. ${ep.qualitySummary.failed > 0 ? `${ep.qualitySummary.failed} failing tests.` : "All tests passing."}`)}</description>
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

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
