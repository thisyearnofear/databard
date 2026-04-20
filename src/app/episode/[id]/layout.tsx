import type { Metadata } from "next";
import { cache } from "@/lib/cache";
import type { Episode } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const episode = cache.get<Episode>(`share:${id}`);

  if (!episode) {
    return { title: "Episode Not Found — DataBard" };
  }

  const desc = `${episode.tableCount} tables · ${episode.qualitySummary.total} tests${
    episode.qualitySummary.failed > 0 ? ` · ${episode.qualitySummary.failed} failing` : ""
  }`;
  const ogImage = `/api/og?id=${id}`;

  return {
    title: `${episode.schemaName} — DataBard`,
    description: `Listen to a podcast walkthrough of the ${episode.schemaName} schema. ${desc}`,
    openGraph: {
      title: `🎙️ DataBard: ${episode.schemaName}`,
      description: `Podcast-style audio docs for the ${episode.schemaName} schema. ${desc}`,
      type: "music.song",
      images: [{ url: ogImage, width: 1200, height: 630, alt: `DataBard episode: ${episode.schemaName}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `🎙️ DataBard: ${episode.schemaName}`,
      description: `Podcast-style audio docs for the ${episode.schemaName} schema. ${desc}`,
      images: [ogImage],
    },
  };
}

export default function EpisodeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
