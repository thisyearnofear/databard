"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { ScriptSegment, Episode } from "@/lib/types";

export function EpisodePlayer({ episode, audioUrl }: { episode: Episode; audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [expandedSeg, setExpandedSeg] = useState<number | null>(null);
  const [clipCopied, setClipCopied] = useState(false);

  // Web Audio API setup for waveform
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
    return () => { ctx.close(); };
  }, [audioUrl]);

  // Responsive canvas sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const w = container.clientWidth;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = 80 * window.devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = "80px";
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Waveform animation
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d")!;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    const barW = w / data.length;
    const mid = h / 2;

    for (let i = 0; i < data.length; i++) {
      const barH = (data[i] / 255) * mid;
      ctx.fillStyle = `hsl(258, 80%, ${50 + (data[i] / 255) * 30}%)`;
      ctx.fillRect(i * barW, mid - barH, barW - 1, barH * 2);
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

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const audio = audioRef.current;
      if (!audio) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (playing) audio.pause(); else audio.play();
          setPlaying(!playing);
          break;
        case "ArrowLeft":
          e.preventDefault();
          audio.currentTime = Math.max(0, audio.currentTime - 10);
          break;
        case "ArrowRight":
          e.preventDefault();
          audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause(); else audio.play();
    setPlaying(!playing);
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
  }

  function handleDownload() {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `databard-${episode.schemaName}.mp3`;
    a.click();
  }

  async function handleShare() {
    setSharing(true);
    try {
      let audioBase64: string | undefined;
      if (audioUrl) {
        const audioRes = await fetch(audioUrl);
        const blob = await audioRes.blob();
        const buffer = await blob.arrayBuffer();
        audioBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      }

      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...episode, audioBase64 }),
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

  async function handleClip() {
    // Pick the most interesting segment: quality failures > intro > first
    const highlight = episode.script.find((s) =>
      s.text.toLowerCase().includes("failing") || s.text.toLowerCase().includes("red flag")
    ) ?? episode.script[0];

    const clipText = `🎙️ DataBard on ${episode.schemaName}:\n\n"${highlight.text}"\n— ${highlight.speaker}\n\n${shareUrl ?? window.location.origin}`;
    await navigator.clipboard.writeText(clipText);
    setClipCopied(true);
    setTimeout(() => setClipCopied(false), 2000);
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const segDuration = duration / (episode.script.length || 1);
  const activeIdx = Math.min(Math.floor(currentTime / segDuration), episode.script.length - 1);

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {/* Episode card */}
      <div ref={containerRef} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 sm:p-6">
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold truncate">🎙️ {episode.schemaName}</h2>
            <p className="text-xs sm:text-sm text-[var(--text-muted)]">
              {episode.tableCount} tables · {episode.qualitySummary.total} tests
              {episode.qualitySummary.failed > 0 && (
                <span className="text-[var(--danger)]"> · {episode.qualitySummary.failed} failing</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleDownload}
              className="text-xs bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 cursor-pointer"
              title="Download MP3"
              aria-label="Download episode as MP3"
            >
              ↓
            </button>
            <button
              onClick={handleClip}
              className="text-xs bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 cursor-pointer"
              title="Copy highlight quote for social sharing"
            >
              {clipCopied ? "✓ Clip" : "Clip"}
            </button>
            <button
              onClick={handleShare}
              disabled={sharing}
              className="text-xs bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 cursor-pointer disabled:opacity-50"
              title="Share episode link"
            >
              {shareUrl ? "✓ Link" : "Share"}
            </button>
          </div>
        </div>

        {/* Waveform */}
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg bg-[var(--bg)] mb-4"
          style={{ height: "80px" }}
        />

        {/* Controls */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={togglePlay}
            className="bg-[var(--accent)] hover:brightness-110 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg cursor-pointer shrink-0"
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
            aria-label="Seek"
          />
          <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
            {fmt(currentTime)} / {duration > 0 ? fmt(duration) : "—"}
          </span>
        </div>

        <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center hidden sm:block">
          Space to play/pause · ← → to seek 10s
        </p>
      </div>

      {/* Segment timeline */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 max-h-72 overflow-y-auto">
        <h3 className="text-sm font-medium text-[var(--text-muted)] mb-2">Segments</h3>
        {episode.script.map((seg: ScriptSegment, i: number) => (
          <button
            key={i}
            onClick={() => setExpandedSeg(expandedSeg === i ? null : i)}
            className={`flex gap-2 py-1.5 px-2 rounded text-sm w-full text-left cursor-pointer transition-colors ${
              i === activeIdx ? "bg-[var(--accent-glow)]" : "hover:bg-[var(--bg)]"
            }`}
          >
            <span className={`font-medium shrink-0 ${seg.speaker === "Alex" ? "text-[var(--accent)]" : "text-[var(--success)]"}`}>
              {seg.speaker}
            </span>
            <span className={`text-[var(--text-muted)] ${expandedSeg === i ? "whitespace-normal" : "truncate"}`}>
              {seg.text}
            </span>
          </button>
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
