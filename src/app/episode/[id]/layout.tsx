import type { Metadata } from "next";
import { shares } from "@/lib/store";
import { scoreFromEpisode } from "@/lib/score-card";
import type { Episode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const episode = shares.get<Episode>(id);

  if (!episode) {
    return { title: "Finding not found — DataBard" };
  }

  const card = scoreFromEpisode(episode);
  const ogImage = `/api/og?id=${encodeURIComponent(id)}`;
  const title = `${card.name} is ${card.score}`;
  const description = card.quote;

  return {
    title: `${title} — DataBard`,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${card.name} health ${card.score}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function EpisodeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
