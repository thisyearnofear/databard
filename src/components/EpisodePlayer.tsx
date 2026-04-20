"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { ScriptSegment, Episode } from "@/lib/types";

export function EpisodePlayer({ episode, audioUrl }: { episode: Episode; audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // Web Audio API setup for waveform
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
    return () => { ctx.close(); };
  }, [audioUrl]);

  // Waveform animation
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d")!;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barW = canvas.width / data.length;
    const mid = canvas.height / 2;

    for (let i = 0; i < data.length; i++) {
      const h = (data[i] / 255) * mid;
      ctx.fillStyle = `hsl(258, 80%, ${50 + (data[i] / 255) * 30}%)`;
      ctx.fillRect(i * barW, mid - h, barW - 1, h * 2);
    }

    animRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  useEffect(() => {
    if (playing) {
      animRef.current = requestAnimationFrame(drawWaveform);
    } else {
      cancelAnimationFrame(animRef.current);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, drawWaveform]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
  }

  async function handleShare() {
    setSharing(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(episode),
      });
      const data = await res.json();
      if (data.ok) {
        const url = `${window.location.origin}/episode/${data.id}`;
        setShareUrl(url);
        await navigator.clipboard.writeText(url);
      }
    } catch (e) {
      console.error("Share failed:", e);
    } finally {
      setSharing(false);
    }
  }

  // Estimate which segment is playing (rough: equal time per segment)
  const segDuration = duration / (episode.script.length || 1);
  const activeIdx = Math.min(Math.floor(currentTime / segDuration), episode.script.length - 1);

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {/* Episode card */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">🎙️ {episode.schemaName}</h2>
            <p className="text-sm text-[var(--text-muted)]">
              {episode.tableCount} tables · {episode.qualitySummary.total} tests
              {episode.qualitySummary.failed > 0 && (
                <span className="text-[var(--danger)]"> · {episode.qualitySummary.failed} failing</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              disabled={sharing}
              className="text-xs bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg px-3 py-1.5 cursor-pointer disabled:opacity-50"
              title="Share episode"
            >
              {shareUrl ? "✓ Copied" : "Share"}
            </button>
            <span className="text-xs text-[var(--text-muted)]">
              {duration > 0 ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : "—"}
            </span>
          </div>
        </div>

        {/* Waveform */}
        <canvas
          ref={canvasRef}
          width={600}
          height={80}
          className="w-full h-20 rounded-lg bg-[var(--bg)] mb-4"
        />

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="bg-[var(--accent)] hover:brightness-110 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg cursor-pointer"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="text-xs text-[var(--text-muted)] tabular-nums w-12 text-right">
            {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Segment timeline */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 max-h-64 overflow-y-auto">
        <h3 className="text-sm font-medium text-[var(--text-muted)] mb-2">Segments</h3>
        {episode.script.map((seg: ScriptSegment, i: number) => (
          <div
            key={i}
            className={`flex gap-2 py-1.5 px-2 rounded text-sm ${i === activeIdx ? "bg-[var(--accent-glow)]" : ""}`}
          >
            <span className={`font-medium shrink-0 ${seg.speaker === "Alex" ? "text-[var(--accent)]" : "text-[var(--success)]"}`}>
              {seg.speaker}
            </span>
            <span className="text-[var(--text-muted)] truncate">{seg.text}</span>
          </div>
        ))}
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
        preload="auto"
      />
    </div>
  );
}
