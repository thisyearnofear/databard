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
    "/league",
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
    changeFrequency: path === "" || path === "/league" ? "daily" : "weekly",
    priority: path === "" ? 1.0 : path === "/league" || path === "/demo" ? 0.9 : 0.6,
  }));
}
