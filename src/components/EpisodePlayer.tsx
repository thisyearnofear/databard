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
  const [loading, setLoading] = useState(true);

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
    
    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "rgba(124, 91, 245, 0.1)");
    gradient.addColorStop(1, "rgba(91, 245, 140, 0.1)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barW = canvas.width / data.length;
    const mid = canvas.height / 2;

    // Draw bars with gradient
    for (let i = 0; i < data.length; i++) {
      const h = (data[i] / 255) * mid * 1.2; // Amplify for drama
      
      // Create gradient for each bar
      const barGradient = ctx.createLinearGradient(0, mid - h, 0, mid + h);
      const intensity = data[i] / 255;
      barGradient.addColorStop(0, `hsla(258, 80%, ${50 + intensity * 30}%, ${0.8 + intensity * 0.2})`);
      barGradient.addColorStop(0.5, `hsla(150, 80%, ${50 + intensity * 30}%, ${0.8 + intensity * 0.2})`);
      barGradient.addColorStop(1, `hsla(258, 80%, ${50 + intensity * 30}%, ${0.8 + intensity * 0.2})`);
      
      ctx.fillStyle = barGradient;
      ctx.fillRect(i * barW, mid - h, barW - 1, h * 2);
      
      // Add glow effect for high frequencies
      if (data[i] > 200) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = "rgba(124, 91, 245, 0.8)";
        ctx.fillRect(i * barW, mid - h, barW - 1, h * 2);
        ctx.shadowBlur = 0;
      }
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
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(err => console.error("Playback failed:", err));
      setPlaying(true);
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = Number(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }

  function skipForward() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audio.currentTime + 10, duration);
  }

  function skipBackward() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(audio.currentTime - 10, 0);
  }

  // Estimate which segment is playing (rough: equal time per segment)
  const segDuration = duration / (episode.script.length || 1);
  const activeIdx = Math.min(Math.floor(currentTime / segDuration), episode.script.length - 1);

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4 animate-fadeIn">
      {/* Episode card */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-lg relative overflow-hidden">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-[var(--success)]/5 opacity-50"></div>
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent)] to-[var(--success)] rounded-lg flex items-center justify-center text-2xl animate-pulse-glow">
                  🎙️
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{episode.schemaName}</h2>
                  <p className="text-xs text-[var(--text-muted)]">{episode.schemaFqn}</p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-xs bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)]">
                  📊 {episode.tableCount} tables
                </span>
                <span className="text-xs bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)]">
                  🧪 {episode.qualitySummary.total} tests
                </span>
                {episode.qualitySummary.failed > 0 ? (
                  <span className="text-xs bg-[var(--danger)]/20 text-[var(--danger)] px-2 py-1 rounded border border-[var(--danger)] animate-pulse">
                    ⚠️ {episode.qualitySummary.failed} failing
                  </span>
                ) : episode.qualitySummary.total > 0 ? (
                  <span className="text-xs bg-[var(--success)]/20 text-[var(--success)] px-2 py-1 rounded border border-[var(--success)]">
                    ✓ All passing
                  </span>
                ) : null}
              </div>
            </div>
            
            <div className="text-right">
              <span className="text-2xl font-bold text-[var(--accent)]">
                {duration > 0 ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : "—"}
              </span>
              <p className="text-xs text-[var(--text-muted)]">duration</p>
            </div>
          </div>

        {/* Waveform */}
        {loading && (
          <div className="w-full h-24 rounded-lg bg-[var(--bg)] mb-4 flex items-center justify-center border border-[var(--border)]">
            <div className="flex gap-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-[var(--accent)] rounded-full animate-pulse"
                  style={{
                    height: `${20 + Math.random() * 40}px`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                ></div>
              ))}
            </div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={600}
          height={96}
          className={`w-full h-24 rounded-lg bg-[var(--bg)] mb-4 border border-[var(--border)] ${loading ? "hidden" : ""}`}
        />

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={skipBackward}
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Skip backward 10s"
            title="Skip backward 10s"
          >
            ⏪
          </button>
          <button
            onClick={togglePlay}
            disabled={loading}
            className="bg-[var(--accent)] hover:brightness-110 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            onClick={skipForward}
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Skip forward 10s"
            title="Skip forward 10s"
          >
            ⏩
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={seek}
            disabled={loading}
            className="flex-1 accent-[var(--accent)] disabled:opacity-50"
          />
          <span className="text-xs text-[var(--text-muted)] tabular-nums w-12 text-right">
            {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Segment timeline */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 max-h-64 overflow-y-auto shadow-lg">
        <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3 flex items-center gap-2">
          <span>📝</span> Transcript
        </h3>
        {episode.script.map((seg: ScriptSegment, i: number) => (
          <div
            key={i}
            className={`flex gap-3 py-2 px-3 rounded text-sm transition-all ${
              i === activeIdx 
                ? "bg-[var(--accent-glow)] border-l-2 border-[var(--accent)]" 
                : "hover:bg-[var(--bg)]"
            }`}
          >
            <span className={`font-medium shrink-0 ${seg.speaker === "Alex" ? "text-[var(--accent)]" : "text-[var(--success)]"}`}>
              {seg.speaker}
            </span>
            <span className={`${i === activeIdx ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
              {seg.text}
            </span>
          </div>
        ))}
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          setDuration(audioRef.current?.duration ?? 0);
          setLoading(false);
        }}
        onEnded={() => setPlaying(false)}
        onError={(e) => console.error("Audio error:", e)}
        preload="auto"
      />
    </div>
  );
}
