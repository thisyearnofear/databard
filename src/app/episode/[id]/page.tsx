"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import { MondaySignup } from "@/components/MondaySignup";
import { ScoreCardView } from "@/components/ScoreCardView";
import { track } from "@/lib/track";
import { scoreFromEpisode } from "@/lib/score-card";
import { homeHref, workspaceFromSearch, workspaceHref } from "@/lib/product/workspaces";
import type { Episode } from "@/lib/types";

export default function SharedEpisode() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg)]" />}>
      <SharedEpisodeInner />
    </Suspense>
  );
}

function formatExpiry(seconds: number): string {
  if (seconds > 86400) return `Expires in ${Math.round(seconds / 86400)}d`;
  if (seconds > 3600) return `Expires in ${Math.round(seconds / 3600)}h`;
  if (seconds > 60) return `Expires in ${Math.round(seconds / 60)}m`;
  return "Expiring soon";
}

function SharedEpisodeInner() {
  const params = useParams();
  const id = params.id as string;
  const searchParams = useSearchParams();
  const workspace = workspaceFromSearch(searchParams.toString());
  const segmentIdx = searchParams.get("seg");
  const segNumber = segmentIdx != null && segmentIdx !== "" ? Number.parseInt(segmentIdx, 10) : null;

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [clipPlaying, setClipPlaying] = useState(false);
  const [retry, setRetry] = useState(0);
  const clipRef = useRef<HTMLAudioElement>(null);
  const clipStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    async function loadEpisode() {
      try {
        let res = await fetch(`/api/share?id=${id}`);
        let data = await res.json();

        // Demo ids are re-seedable — heal an expired or missing demo share
        // in place instead of showing a dead end.
        if (!data.ok && (id === "demo" || id === "demo-enterprise")) {
          await fetch("/api/demo/seed", { method: "POST" }).catch(() => null);
          res = await fetch(`/api/share?id=${id}`);
          data = await res.json();
        }

        if (data.ok) {
          const ep = data.episode as Episode & { audioBase64?: string };
          if (data.expiresIn != null) setExpiresIn(data.expiresIn);

          if (ep.audioBase64) {
            const bytes = Uint8Array.from(atob(ep.audioBase64), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: "audio/mpeg" });
            setAudioUrl(URL.createObjectURL(blob));
          } else if (ep.audioUrl) {
            setAudioUrl(ep.audioUrl);
          }

          setEpisode(ep);
          track("shared_episode_open", { schema: ep.schemaName, seg: segmentIdx ?? "" });
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
  }, [id, segmentIdx, retry]);

  useEffect(() => {
    return () => {
      clipStopRef.current?.();
    };
  }, []);

  function playFinding() {
    const audio = clipRef.current;
    if (!audio || !episode) return;
    const card = scoreFromEpisode(episode, Number.isFinite(segNumber) ? segNumber : null);
    const n = episode.script.length || 1;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 120;
    const start = duration * (card.segmentIndex / n);
    const stopAt = start + 15;
    clipStopRef.current?.();
    const onTime = () => {
      if (audio.currentTime >= stopAt) {
        audio.pause();
        audio.removeEventListener("timeupdate", onTime);
        setClipPlaying(false);
      }
    };
    clipStopRef.current = () => audio.removeEventListener("timeupdate", onTime);
    audio.currentTime = start;
    audio.addEventListener("timeupdate", onTime);
    void audio.play().then(() => setClipPlaying(true)).catch(() => setClipPlaying(false));
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading finding…</p>
      </main>
    );
  }

  if (error || !episode) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-[var(--danger)]">{error || "This briefing is no longer live"}</p>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 max-w-sm text-center">
          <p className="text-sm mb-3">See this week&apos;s public table instead.</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setLoading(true);
                setRetry((r) => r + 1);
              }}
              className="bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
            >
              Replay the demo →
            </button>
            <a
              href="/league"
              className="inline-block border border-[var(--border)] hover:border-[var(--accent)] rounded-lg px-4 py-2 text-sm font-medium"
            >
              Open the league →
            </a>
          </div>
        </div>
      </main>
    );
  }

  const card = scoreFromEpisode(episode, Number.isFinite(segNumber) ? segNumber : null);

  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-8 enter-up">
      {expiresIn != null && (
        <p className="text-xs text-[var(--text-muted)]">{formatExpiry(expiresIn)}</p>
      )}

      <ScoreCardView
        card={card}
        onPlayClip={audioUrl ? playFinding : undefined}
        clipPlaying={clipPlaying}
      />
      {audioUrl && <audio ref={clipRef} src={audioUrl} preload="metadata" className="hidden" />}

      <section className="w-full max-w-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <MondaySignup schema={episode.schemaName} />
      </section>

      {audioUrl && (
        <section id="briefing" className="w-full max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)] mb-3">
            Full briefing
          </p>
          <EpisodePlayer episode={episode} audioUrl={audioUrl} />
        </section>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center pb-8">
        <Link
          href={homeHref(workspace)}
          onClick={() => track("shared_episode_cta_click", { cta: "get_this", schema: episode.schemaName })}
          className="bg-[var(--accent)] rounded-md px-5 py-2.5 text-sm font-semibold text-[var(--bg)] hover:brightness-110 text-center"
        >
          Get this on your data
        </Link>
        <Link
          href="/league"
          onClick={() => track("shared_episode_cta_click", { cta: "league", schema: episode.schemaName })}
          className="rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium hover:border-[var(--accent)] text-center"
        >
          This week&apos;s league →
        </Link>
        <Link
          href={workspaceHref("/protocol", workspace)}
          onClick={() => track("shared_episode_cta_click", { cta: "dashboard", schema: episode.schemaName })}
          className="rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium hover:border-[var(--accent)] text-center"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
