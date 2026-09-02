import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://databard.persidian.com";
  const lastModified = new Date();

  const staticPages = [
    "",
    "/protocol",
    "/market",
    "/onchain",
    "/pro",
    "/roast",
    "/league",
    "/fleet",
    "/verify",
    "/alerts",
    "/privacy",
    "/terms",
  ];

  return staticPages.map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: path === "" || path === "/league" ? "daily" : "weekly",
    priority: path === "" ? 1.0 : path === "/league" ? 0.9 : 0.6,
  }));
}
