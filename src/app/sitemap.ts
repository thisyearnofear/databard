import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://databard.persidian.com";
  const lastModified = new Date();

  const staticPages = [
    "",
    "/demo",
    "/protocol",
    "/market",
    "/onchain",
    "/pro",
    "/roast",
    "/leaderboard",
    "/history",
    "/playlists",
    "/verify",
    "/briefing",
    "/alerts",
    "/labs",
    "/research",
    "/privacy",
    "/terms",
  ];

  return staticPages.map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1.0 : path === "/demo" ? 0.9 : 0.6,
  }));
}
