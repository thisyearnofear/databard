"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import type { Episode } from "@/lib/types";

export default function SharedEpisode() {
  const params = useParams();
  const id = params.id as string;
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEpisode() {
      try {
        const res = await fetch(`/api/share?id=${id}`);
        const data = await res.json();

        if (data.ok) {
          const ep = data.episode;

          // Reconstruct audio from base64 if available
          if (ep.audioBase64) {
            const bytes = Uint8Array.from(atob(ep.audioBase64), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: "audio/mpeg" });
            setAudioUrl(URL.createObjectURL(blob));
          }

          setEpisode(ep);
        } else {
          setError(data.error);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load episode");
      } finally {
        setLoading(false);
      }
    }

    loadEpisode();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading episode…</p>
      </main>
    );
  }

  if (error || !episode || !audioUrl) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-[var(--danger)]">{error || "Episode not found or audio unavailable"}</p>
        <a href="/" className="text-[var(--accent)] hover:underline">← Back to home</a>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6 sm:gap-8">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-2">🎙️ DataBard</h1>
        <p className="text-[var(--text-muted)] text-lg">Shared Episode</p>
      </div>

      <EpisodePlayer episode={episode} audioUrl={audioUrl} />

      <a href="/" className="text-sm text-[var(--accent)] hover:underline">
        Create your own episode →
      </a>
    </main>
  );
}
