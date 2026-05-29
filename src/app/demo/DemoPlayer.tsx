"use client";

import { EpisodePlayer } from "@/components/EpisodePlayer";
import Link from "next/link";
import type { Episode } from "@/lib/types";

interface DemoPlayerProps {
  episode: Episode;
  demoMp3: string;
}

export default function DemoPlayer({ episode, demoMp3 }: DemoPlayerProps) {
  return (
    <>
      <div className="w-full max-w-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl px-4 py-3 text-center">
        <p className="text-xs text-[var(--text-muted)]">
          🎧 Demo episode — pre-rendered server-side for instant playback.
          <Link href="/" className="text-[var(--accent)] hover:underline ml-1">
            Connect your data →
          </Link>
        </p>
      </div>
      <EpisodePlayer episode={episode} audioUrl={demoMp3} />
    </>
  );
}
