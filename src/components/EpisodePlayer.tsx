"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import type { ScriptSegment, Episode, TableMeta, LineageEdge } from "@/lib/types";
import { analyzeSchema, generateActionItems, type ActionItem, type ActionPriority } from "@/lib/schema-analysis";

const SPEEDS = [1, 1.25, 1.5, 2] as const;
type PlayerTab = "segments" | "insights" | "actions";

function HealthBadge({ summary }: { summary: Episode["qualitySummary"] }) {
  if (summary.total === 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--border)] text-[var(--text-muted)]">No tests</span>;
  if (summary.failed === 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--success)]/20 text-[var(--success)]">✓ Healthy</span>;
  const ratio = summary.failed / summary.total;
  if (ratio > 0.3) return <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--danger)]/20 text-[var(--danger)]">⚠ {summary.failed} failing</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">⚠ {summary.failed} failing</span>;
}

function TableDetail({ table, lineage }: { table: TableMeta; lineage: LineageEdge[] }) {
  const upstream = lineage.filter((e) => e.toTable.endsWith(`.${table.name}`)).map((e) => e.fromTable.split(".").pop());
  const downstream = lineage.filter((e) => e.fromTable.endsWith(`.${table.name}`)).map((e) => e.toTable.split(".").pop());
  const failed = table.qualityTests.filter((t) => t.status === "Failed");
  const passed = table.qualityTests.filter((t) => t.status === "Success");

  return (
    <div className="mt-2 p-3 bg-[var(--bg)] rounded-lg text-xs space-y-2 animate-slide-up">
      {/* Header: owner + row count + freshness */}
      <div className="flex flex-wrap gap-3 text-[var(--text-muted)]">
        {table.owner && <span>👤 {table.owner}</span>}
        {table.rowCount != null && <span>📊 {table.rowCount > 1_000_000 ? `${(table.rowCount / 1_000_000).toFixed(1)}M` : table.rowCount > 1000 ? `${(table.rowCount / 1000).toFixed(0)}K` : table.rowCount} rows</span>}
        {table.freshness && <span>🕐 {new Date(table.freshness).toLocaleDateString()}</span>}
      </div>

      {table.description && (
        <p className="text-[var(--text-muted)] italic">{table.description}</p>
      )}

      {/* PII warning */}
      {table.piiColumns && table.piiColumns.length > 0 && (
        <div className="px-2 py-1 rounded bg-[var(--danger)]/10 text-[var(--danger)]">
          🔒 PII: {table.piiColumns.join(", ")}
        </div>
      )}

      {/* Glossary terms */}
      {table.glossaryTerms && table.glossaryTerms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {table.glossaryTerms.map((term) => (
            <span key={term} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">📖 {term}</span>
          ))}
        </div>
      )}

      {/* Columns */}
      <div>
        <span className="text-[var(--text-muted)]">Columns ({table.columns.length}): </span>
        <span className="text-[var(--text)]">
          {table.columns.slice(0, 6).map((c) => `${c.name} (${c.dataType})`).join(", ")}
          {table.columns.length > 6 && ` +${table.columns.length - 6} more`}
        </span>
      </div>

      {/* Tests */}
      {table.qualityTests.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {failed.map((t) => (
            <span key={t.name} className="px-1.5 py-0.5 rounded bg-[var(--danger)]/20 text-[var(--danger)]">✗ {t.name}</span>
          ))}
          {passed.map((t) => (
            <span key={t.name} className="px-1.5 py-0.5 rounded bg-[var(--success)]/20 text-[var(--success)]">✓ {t.name}</span>
          ))}
        </div>
      )}
      {table.qualityTests.length === 0 && (
        <p className="text-[var(--text-muted)]">No quality tests configured</p>
      )}

      {/* Lineage */}
      {(upstream.length > 0 || downstream.length > 0) && (
        <div className="flex gap-4">
          {upstream.length > 0 && <span className="text-[var(--text-muted)]">← {upstream.join(", ")}</span>}
          {downstream.length > 0 && <span className="text-[var(--text-muted)]">→ {downstream.join(", ")}</span>}
        </div>
      )}

      {/* Tags */}
      {table.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {table.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lightweight markdown → JSX for investigation results */
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Headings
    if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(<p key={i} className="font-semibold text-[var(--text)] mt-2 mb-1">{line.replace(/\*\*/g, "")}</p>);
      continue;
    }

    // Numbered lists
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-[var(--accent)] shrink-0 w-4 text-right">{numMatch[1]}.</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(numMatch[2]) }} />
        </div>
      );
      continue;
    }

    // Bullet lists
    if (line.startsWith("- ") || line.startsWith("• ")) {
      elements.push(
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-[var(--accent)] shrink-0">·</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />
        </div>
      );
      continue;
    }

    // Empty lines
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
      continue;
    }

    // Regular text with inline formatting
    elements.push(<p key={i} className="py-0.5" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
  }

  return <>{elements}</>;
}

function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code style="background:var(--border);padding:1px 4px;border-radius:3px;font-family:JetBrains Mono,monospace;font-size:10px;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--text);font-weight:600;">$1</strong>');
}

function PriorityBadge({ priority }: { priority: ActionPriority }) {
  const styles: Record<ActionPriority, string> = {
    critical: "bg-[var(--danger)]/20 text-[var(--danger)]",
    high: "bg-yellow-500/20 text-yellow-400",
    medium: "bg-blue-500/20 text-blue-400",
    low: "bg-[var(--border)] text-[var(--text-muted)]",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${styles[priority]}`}>
      {priority}
    </span>
  );
}

export function EpisodePlayer({ episode, audioUrl, segmentOffsets }: { episode: Episode; audioUrl: string; segmentOffsets?: number[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const segListRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [expandedSeg, setExpandedSeg] = useState<number | null>(null);
  const [clipCopied, setClipCopied] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlayerTab>("insights");
  const [investigations, setInvestigations] = useState<Record<string, { loading: boolean; result?: string; provider?: string }>>({});
  const [checkedActions, setCheckedActions] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(`databard:actions:${episode.schemaFqn}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // Compute insights and action items from schema metadata
  const { insights, actionItems } = useMemo(() => {
    if (!episode.schemaMeta) return { insights: null, actionItems: [] };
    const ins = analyzeSchema(episode.schemaMeta);
    const items = generateActionItems(ins);
    return { insights: ins, actionItems: items };
  }, [episode.schemaMeta]);

  // Persist checked actions
  function toggleAction(id: string) {
    setCheckedActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(`databard:actions:${episode.schemaFqn}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  async function handleInvestigate(item: ActionItem) {
    if (investigations[item.id]?.loading) return;
    setInvestigations((prev) => ({ ...prev, [item.id]: { loading: true } }));
    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionItem: item, schemaName: episode.schemaName }),
      });
      const data = await res.json();
      if (data.ok) {
        setInvestigations((prev) => ({
          ...prev,
          [item.id]: { loading: false, result: data.investigation.summary, provider: data.investigation.provider },
        }));
      } else {
        setInvestigations((prev) => ({ ...prev, [item.id]: { loading: false, result: `Error: ${data.error}` } }));
      }
    } catch (e) {
      setInvestigations((prev) => ({
        ...prev,
        [item.id]: { loading: false, result: `Error: ${e instanceof Error ? e.message : "Failed"}` },
      }));
    }
  }

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

  // Draw static waveform preview when not playing
  useEffect(() => {
    if (playing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    const bars = 128;
    const barW = w / bars;
    const mid = h / 2;

    // Seeded pseudo-random for consistent look
    let seed = 42;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };

    for (let i = 0; i < bars; i++) {
      // Create a natural waveform shape: louder in the middle, quieter at edges
      const pos = i / bars;
      const envelope = Math.sin(pos * Math.PI) * 0.7 + 0.15;
      const noise = rand() * 0.5 + 0.5;
      const barH = envelope * noise * mid;
      const alpha = 0.25 + envelope * 0.35;
      ctx.fillStyle = `hsla(258, 80%, 65%, ${alpha})`;
      ctx.fillRect(i * barW, mid - barH, barW - 1, barH * 2);
    }
  }, [playing]);

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

  // Compute active segment from actual offsets (fractions of duration) or fall back to even division
  const getActiveIdx = useCallback(() => {
    if (segmentOffsets && segmentOffsets.length > 0 && duration > 0) {
      for (let i = segmentOffsets.length - 1; i >= 0; i--) {
        if (currentTime >= segmentOffsets[i] * duration) return Math.min(i, episode.script.length - 1);
      }
      return 0;
    }
    const segDuration = duration / (episode.script.length || 1);
    return Math.min(Math.floor(currentTime / segDuration), episode.script.length - 1);
  }, [currentTime, duration, segmentOffsets, episode.script.length]);

  const activeIdx = getActiveIdx();

  // Auto-scroll segment list to active segment
  useEffect(() => {
    if (!playing) return;
    const list = segListRef.current;
    if (!list) return;
    const activeEl = list.children[activeIdx + 1] as HTMLElement; // +1 for the h3 header
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIdx, playing]);

  // Close share menu on click outside
  useEffect(() => {
    if (!showShareMenu) return;
    const close = () => setShowShareMenu(false);
    window.addEventListener("click", close, { once: true });
    return () => window.removeEventListener("click", close);
  }, [showShareMenu]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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

  function seekToSegment(i: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    if (segmentOffsets && segmentOffsets.length > i) {
      audio.currentTime = segmentOffsets[i] * duration;
    } else {
      const segDuration = duration / (episode.script.length || 1);
      audio.currentTime = i * segDuration;
    }
    if (!playing) { audio.play(); setPlaying(true); }
  }

  function cycleSpeed() {
    const audio = audioRef.current;
    if (!audio) return;
    const idx = SPEEDS.indexOf(speed as typeof SPEEDS[number]);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    audio.playbackRate = next;
    setSpeed(next);
  }

  function handleDownload() {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `databard-${episode.schemaName}.mp3`;
    a.click();
    setNudge("download");
    setTimeout(() => setNudge(null), 8000);
  }

  async function handleShare() {
    setSharing(true);
    try {
      // Upload episode for shareable URL
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

        // Try native share sheet (mobile)
        if (navigator.share) {
          try {
            await navigator.share({
              title: `🎙️ DataBard: ${episode.schemaName}`,
              text: `Listen to a podcast walkthrough of the ${episode.schemaName} schema — ${episode.tableCount} tables, ${episode.qualitySummary.total} tests`,
              url,
            });
            return;
          } catch {
            // User cancelled or not supported — fall through to menu
          }
        }

        // Desktop: show share menu
        setShowShareMenu(true);
        setNudge("share");
        setTimeout(() => setNudge(null), 8000);
      }
    } catch (e) {
      console.error("Share failed:", e);
    } finally {
      setSharing(false);
    }
  }

  function shareVia(platform: string) {
    if (!shareUrl) return;
    const text = `🎙️ Listen to a DataBard episode on the ${episode.schemaName} schema`;
    const encoded = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(shareUrl);

    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encoded}%20${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encoded}`,
      twitter: `https://twitter.com/intent/tweet?text=${encoded}&url=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      copy: "",
    };

    if (platform === "copy") {
      navigator.clipboard.writeText(shareUrl);
      setShowShareMenu(false);
      return;
    }

    window.open(urls[platform], "_blank", "noopener,noreferrer,width=600,height=400");
    setShowShareMenu(false);
  }

  async function handleDownloadReport() {
    if (!episode.schemaMeta) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const res = await fetch("/api/canvas/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReportError((data as { error?: string }).error ?? "Failed to generate report");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `databard-${episode.schemaName}-report.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setReportLoading(false);
    }
  }

  async function handleClip() {
    const highlight = episode.script.find((s) =>
      s.text.toLowerCase().includes("failing") || s.text.toLowerCase().includes("red flag")
    ) ?? episode.script[0];

    const clipText = `🎙️ DataBard on ${episode.schemaName}:\n\n"${highlight.text}"\n— ${highlight.speaker}\n\n${shareUrl ?? window.location.origin}`;

    // Try native share with the clip text
    if (navigator.share) {
      try {
        await navigator.share({ title: `DataBard: ${episode.schemaName}`, text: clipText });
        return;
      } catch { /* cancelled */ }
    }

    await navigator.clipboard.writeText(clipText);
    setClipCopied(true);
    setTimeout(() => setClipCopied(false), 2000);
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4 animate-slide-up">
      {/* Episode card */}
      <div ref={containerRef} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 sm:p-6">
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg sm:text-xl font-semibold truncate">🎙️ {episode.schemaName}</h2>
              <HealthBadge summary={episode.qualitySummary} />
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-muted)]">
              {episode.tableCount} tables · {episode.qualitySummary.total} tests
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 relative">
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
              title="Share episode"
            >
              {sharing ? "…" : shareUrl ? "✓ Share" : "Share"}
            </button>
            {episode.schemaMeta && (
              <button
                onClick={handleDownloadReport}
                disabled={reportLoading}
                className="text-xs bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 cursor-pointer disabled:opacity-50"
                title="Download 3-slide visual health report as PDF"
              >
                {reportLoading ? "…" : "📊 Report"}
              </button>
            )}

            {/* Share menu (desktop fallback) */}
            {showShareMenu && (
              <div className="absolute top-full right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg z-10 animate-slide-up min-w-[140px]">
                {[
                  { id: "whatsapp", label: "WhatsApp" },
                  { id: "telegram", label: "Telegram" },
                  { id: "twitter", label: "Twitter/X" },
                  { id: "linkedin", label: "LinkedIn" },
                  { id: "copy", label: "Copy link" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => shareVia(p.id)}
                    className="block w-full text-left text-xs px-3 py-2 hover:bg-[var(--bg)] cursor-pointer first:rounded-t-lg last:rounded-b-lg"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
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
          <button
            onClick={cycleSpeed}
            className="text-[10px] font-mono bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded px-1.5 py-0.5 cursor-pointer shrink-0 tabular-nums"
            title="Playback speed"
          >
            {speed}×
          </button>
          <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
            {fmt(currentTime)} / {duration > 0 ? fmt(duration) : "—"}
          </span>
        </div>

        <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center hidden sm:block">
          Space to play/pause · ← → to seek 10s · Click a segment to jump
        </p>

        {/* Report error */}
        {reportError && (
          <div className="mt-2 text-center text-xs text-[var(--danger)] animate-slide-up">
            {reportError}
          </div>
        )}

        {/* Contextual nudge */}
        {nudge && (
          <div className="mt-3 text-center text-xs text-[var(--text-muted)] animate-slide-up">
            {nudge === "download" && "💡 Want a fresh episode every week? "}
            {nudge === "share" && "💡 Share it with your whole team automatically — "}
            <a href="/#pricing" className="text-[var(--accent)] hover:underline">
              Get DataBard Pro →
            </a>
          </div>
        )}
      </div>

      {/* Tabbed panel: Insights | Actions | Segments */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-[var(--border)]">
          {([
            { id: "insights" as const, label: "Summary", count: insights ? `${insights.healthScore}` : undefined },
            { id: "actions" as const, label: "Actions", count: actionItems.length > 0 ? `${actionItems.length - checkedActions.size}` : undefined },
            { id: "segments" as const, label: "Transcript" },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium cursor-pointer transition-colors relative ${
                activeTab === tab.id
                  ? "text-[var(--accent)] bg-[var(--accent-glow)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
              }`}
            >
              {tab.label}
              {tab.count && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeTab === tab.id ? "bg-[var(--accent)] text-white" : "bg-[var(--border)] text-[var(--text-muted)]"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Insights tab */}
        {activeTab === "insights" && insights && (
          <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
            {/* Health score */}
            <div className="flex items-center gap-4">
              <div className={`text-3xl font-bold tabular-nums ${
                insights.healthLabel === "healthy" ? "text-[var(--success)]"
                : insights.healthLabel === "at-risk" ? "text-yellow-400"
                : "text-[var(--danger)]"
              }`}>
                {insights.healthScore}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Health Score</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {insights.healthLabel === "healthy" ? "Looking good" : insights.healthLabel === "at-risk" ? "Needs attention" : "Critical issues"}
                </div>
              </div>
            </div>

            {/* Coverage bars */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--text-muted)]">Test coverage</span>
                  <span className="tabular-nums">{insights.testCoverage}%</span>
                </div>
                <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--accent)] rounded-full transition-all" style={{ width: `${insights.testCoverage}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--text-muted)]">Documentation</span>
                  <span className="tabular-nums">{insights.docCoverage}%</span>
                </div>
                <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--success)] rounded-full transition-all" style={{ width: `${insights.docCoverage}%` }} />
                </div>
              </div>
            </div>

            {/* Key stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[var(--bg)] rounded-lg p-2">
                <div className="text-lg font-semibold tabular-nums">{insights.failingTests}</div>
                <div className="text-[10px] text-[var(--text-muted)]">Failing</div>
              </div>
              <div className="bg-[var(--bg)] rounded-lg p-2">
                <div className="text-lg font-semibold tabular-nums">{insights.untestedTables.length}</div>
                <div className="text-[10px] text-[var(--text-muted)]">Untested</div>
              </div>
              <div className="bg-[var(--bg)] rounded-lg p-2">
                <div className="text-lg font-semibold tabular-nums">{insights.ownerlessTables.length}</div>
                <div className="text-[10px] text-[var(--text-muted)]">No owner</div>
              </div>
            </div>

            {/* Critical tables */}
            {insights.criticalTables.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">Critical Tables</h4>
                <div className="space-y-1.5">
                  {insights.criticalTables.slice(0, 5).map((ct) => (
                    <div key={ct.table.name} className="flex items-center gap-2 text-xs bg-[var(--bg)] rounded-lg px-3 py-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        ct.risk === "critical" ? "bg-[var(--danger)]" : ct.risk === "high" ? "bg-yellow-400" : "bg-[var(--border)]"
                      }`} />
                      <span className="font-medium truncate">{ct.table.name}</span>
                      <span className="text-[var(--text-muted)] ml-auto shrink-0">
                        {ct.failingTests > 0 && `${ct.failingTests} failing`}
                        {ct.failingTests > 0 && ct.downstreamCount > 0 && " · "}
                        {ct.downstreamCount > 0 && `${ct.downstreamCount} downstream`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lineage hotspots */}
            {insights.lineageHotspots.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2">Lineage Hotspots</h4>
                <div className="flex flex-wrap gap-1.5">
                  {insights.lineageHotspots.map((h) => (
                    <span key={h.name} className="text-xs px-2 py-1 rounded bg-[var(--bg)] text-[var(--text-muted)]">
                      {h.name} <span className="text-[var(--accent)]">({h.connections})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Insights fallback when no schemaMeta */}
        {activeTab === "insights" && !insights && (
          <div className="p-6 text-center text-sm text-[var(--text-muted)]">
            <p>Schema metadata not available for this episode.</p>
            <p className="text-xs mt-1">Connect to a data source to see full insights.</p>
          </div>
        )}

        {/* Actions tab */}
        {activeTab === "actions" && (
          <div className="p-4 max-h-96 overflow-y-auto">
            {actionItems.length === 0 ? (
              <div className="text-center text-sm text-[var(--text-muted)] py-6">
                <p>🎉 No action items — your schema is in great shape!</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-[var(--text-muted)]">
                    {checkedActions.size}/{actionItems.length} resolved
                  </span>
                  <div className="h-1 flex-1 mx-3 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--success)] rounded-full transition-all"
                      style={{ width: `${actionItems.length > 0 ? (checkedActions.size / actionItems.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                {actionItems.map((item) => {
                  const checked = checkedActions.has(item.id);
                  const inv = investigations[item.id];
                  return (
                    <div
                      key={item.id}
                      className={`text-xs rounded-lg px-3 py-2.5 transition-all ${
                        checked ? "bg-[var(--bg)] opacity-60" : "bg-[var(--bg)]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAction(item.id)}
                          className="mt-0.5 accent-[var(--accent)] cursor-pointer shrink-0"
                          aria-label={`Mark "${item.title}" as done`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <PriorityBadge priority={item.priority} />
                            <span className={`font-medium ${checked ? "line-through text-[var(--text-muted)]" : ""}`}>
                              {item.title}
                            </span>
                          </div>
                          <p className="text-[var(--text-muted)] leading-relaxed">{item.description}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-muted)]">{item.category}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-muted)]">~{item.effort}</span>
                            {!checked && !inv?.result && (
                              <button
                                onClick={() => handleInvestigate(item)}
                                disabled={inv?.loading}
                                className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
                              >
                                {inv?.loading ? "Investigating…" : "Investigate →"}
                              </button>
                            )}
                            {inv?.provider && inv.result && (
                              <span className="text-[10px] text-[var(--text-muted)] ml-auto">via {inv.provider}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Investigation result */}
                      {inv?.result && (
                        <div className="mt-2 ml-6 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-slide-up">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-medium text-[var(--accent)]">Investigation</span>
                            <button
                              onClick={() => setInvestigations((prev) => { const next = { ...prev }; delete next[item.id]; return next; })}
                              className="text-[var(--text-muted)] hover:text-[var(--text)] text-[10px] cursor-pointer"
                            >✕</button>
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">{renderMarkdown(inv.result)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Segments tab (transcript) */}
        {activeTab === "segments" && (
          <div ref={segListRef} className="p-4 max-h-96 overflow-y-auto scroll-smooth">
            {episode.script.map((seg: ScriptSegment, i: number) => {
              const isExpanded = expandedSeg === i;
              const table = isExpanded && episode.schemaMeta
                ? episode.schemaMeta.tables.find((t) => t.name === seg.topic)
                : null;

              return (
                <div key={i}>
                  <button
                    onClick={() => {
                      if (isExpanded) { setExpandedSeg(null); }
                      else { setExpandedSeg(i); seekToSegment(i); }
                    }}
                    className={`flex gap-2 py-1.5 px-2 rounded text-sm w-full text-left cursor-pointer transition-all ${
                      i === activeIdx ? "bg-[var(--accent-glow)] scale-[1.01]" : "hover:bg-[var(--bg)]"
                    }`}
                  >
                    <span className={`font-medium shrink-0 ${seg.speaker === "Alex" ? "text-[var(--accent)]" : "text-[var(--success)]"}`}>
                      {seg.speaker}
                    </span>
                    <span className={`text-[var(--text-muted)] ${isExpanded ? "whitespace-normal" : "truncate"}`}>
                      {seg.text}
                    </span>
                    {table && <span className="text-[var(--accent)] shrink-0 text-xs">📊</span>}
                  </button>
                  {table && (
                    <TableDetail table={table} lineage={episode.schemaMeta!.lineage} />
                  )}
                </div>
              );
            })}
          </div>
        )}
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
