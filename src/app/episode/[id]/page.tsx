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
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-[var(--danger)]">{error || "Episode not found or expired"}</p>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 max-w-sm text-center">
          <p className="text-sm mb-3">Shared episodes expire after 24 hours. Want to hear what DataBard sounds like?</p>
          <a href="/" className="inline-block bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium">
            ▶ Listen to a demo
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
      <div className="text-xs text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5">
        ⏳ Shared episodes expire 24 hours after creation
      </div>
      <EpisodePlayer episode={episode} audioUrl={audioUrl} />

      {/* CTA for shared episode visitors */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 max-w-md text-center">
        <p className="text-sm font-medium mb-1">🎙️ This episode was made with DataBard</p>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Turn any data catalog into a podcast — flag quality issues, trace lineage, and keep your team informed.
        </p>
        <div className="flex gap-2 justify-center">
          <a href="/" className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-xs font-medium">
            Generate your own
          </a>
          <a href="/#pricing" className="bg-[var(--border)] hover:bg-[var(--text-muted)]/20 rounded-lg px-4 py-2 text-xs font-medium">
            See plans
          </a>
        </div>
      </div>
    </main>
  );
}
