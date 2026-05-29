"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface BriefingSegment {
  id: string;
  speaker: string;
  topic: string;
  text: string;
  dataItems?: Record<string, unknown>[];
}

interface BriefingSection {
  category: string;
  label: string;
  count: number;
  items: Record<string, unknown>[];
}

interface BriefingPlayerProps {
  repo: string;
  script: BriefingSegment[];
  sections: BriefingSection[];
  audioUrl: string | null;
  audioError: string | null;
  onRegenerate: () => void;
  generating: boolean;
}

export function BriefingPlayer({
  repo,
  script,
  sections,
  audioUrl,
  audioError,
  onRegenerate,
  generating,
}: BriefingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const segListRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [expandedSeg, setExpandedSeg] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"transcript" | "data">("transcript");

  useEffect(() => {
    const segDuration = duration / (script.length || 1);
    setActiveIdx(Math.min(Math.floor(currentTime / segDuration), script.length - 1));
  }, [currentTime, duration, script.length]);

  useEffect(() => {
    if (!playing) return;
    const list = segListRef.current;
    if (!list) return;
    const activeEl = list.children[activeIdx] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIdx, playing]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
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
    const segDuration = duration / (script.length || 1);
    audio.currentTime = i * segDuration;
    if (!playing) {
      audio.play();
      setPlaying(true);
    }
  }

  function handleDownload() {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `morning-briefing-${repo.replace("/", "-")}.mp3`;
    a.click();
  }

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 animate-slide-up">
      {/* Header card */}
      <div className="bg-[#112130] border border-[#d4af37]/20 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[#d4af37] mb-1">
              🏴‍☠️ Morning Briefing
            </h2>
            <p className="text-[#93a1a1] text-sm">{repo}</p>
            <p className="text-xs text-[#586e75] mt-1">
              Powered by Coral · GitHub activity from the last 24 hours
            </p>
          </div>
          <div className="flex gap-2">
            {audioUrl && (
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 rounded-lg border border-[#d4af37]/30 text-[#d4af37] text-xs hover:bg-[#d4af37]/10 cursor-pointer"
              >
                ↓ MP3
              </button>
            )}
            <button
              onClick={onRegenerate}
              disabled={generating}
              className="px-3 py-1.5 rounded-lg border border-[#2aa198]/30 text-[#2aa198] text-xs hover:bg-[#2aa198]/10 cursor-pointer disabled:opacity-50"
            >
              {generating ? "…" : "⟳ Refresh"}
            </button>
          </div>
        </div>

        {/* Audio player */}
        {audioUrl && (
          <>
            <div className="bg-[#001e26] rounded-lg h-16 mb-4 flex items-center px-4">
              <div className="flex gap-0.5 w-full items-end h-10">
                {Array.from({ length: 64 }).map((_, i) => {
                  const pos = i / 63;
                  const envelope = Math.sin(pos * Math.PI) * 0.8 + 0.2;
                  const h = Math.max(4, envelope * 36);
                  const isActive = i / 63 <= currentTime / (duration || 1);
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm transition-colors"
                      style={{
                        height: `${h}px`,
                        backgroundColor: isActive
                          ? "#d4af37"
                          : "rgba(212, 175, 55, 0.2)",
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="bg-[#d4af37] hover:brightness-110 text-[#002b36] rounded-full w-10 h-10 flex items-center justify-center text-lg cursor-pointer shrink-0"
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
                className="flex-1 accent-[#d4af37]"
              />
              <span className="text-xs text-[#93a1a1] tabular-nums shrink-0">
                {fmt(currentTime)} / {duration > 0 ? fmt(duration) : "--"}
              </span>
            </div>

            <p className="text-[10px] text-[#586e75] mt-3 text-center">
              Click any segment to jump · Space to play/pause
            </p>
          </>
        )}

        {audioError && (
          <div className="bg-[#dc322f]/10 border border-[#dc322f]/30 rounded-lg p-3 mt-3">
            <p className="text-xs text-[#dc322f]">
              Audio synthesis failed: {audioError}
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-[#112130] border border-[#d4af37]/20 rounded-xl overflow-hidden">
        <div className="flex border-b border-[#d4af37]/10">
          {[
            { id: "transcript" as const, label: "🎙️ Transcript", count: script.length },
            { id: "data" as const, label: "📊 Raw Data", count: sections.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2.5 text-xs font-medium cursor-pointer transition-colors ${
                activeTab === tab.id
                  ? "text-[#d4af37] border-b-2 border-[#d4af37]"
                  : "text-[#586e75] hover:text-[#93a1a1]"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-[#001e26] text-[#586e75]">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Transcript tab */}
        {activeTab === "transcript" && (
          <div ref={segListRef} className="p-4 max-h-[50vh] overflow-y-auto scroll-smooth">
            {script.map((seg, i) => (
              <div key={seg.id}>
                <button
                  onClick={() => {
                    if (expandedSeg === i) setExpandedSeg(null);
                    else setExpandedSeg(i);
                    seekToSegment(i);
                  }}
                  className={`flex gap-2 py-1.5 px-2 rounded text-sm w-full text-left cursor-pointer transition-all ${
                    i === activeIdx
                      ? "bg-[#d4af37]/10 border-l-2 border-[#d4af37]"
                      : "hover:bg-[#001e26] border-l-2 border-transparent"
                  }`}
                >
                  <span
                    className={`font-medium shrink-0 text-xs ${
                      seg.speaker === "Alex" ? "text-[#2aa198]" : "text-[#b58900]"
                    }`}
                  >
                    {seg.speaker}
                  </span>
                  <span className="text-[#93a1a1]">{seg.text}</span>
                </button>
                {expandedSeg === i && seg.dataItems && seg.dataItems.length > 0 && (
                  <div className="ml-8 mt-1 mb-2 p-3 bg-[#001e26] rounded-lg border border-[#d4af37]/10 animate-slide-up">
                    <p className="text-[10px] text-[#586e75] mb-2">Related data:</p>
                    {seg.dataItems.map((item, j) => (
                      <div key={j} className="text-xs text-[#93a1a1] py-0.5">
                        {Object.entries(item)
                          .filter(([k]) => k !== "url" && k !== "id")
                          .map(([k, v]) => (
                            <span key={k} className="mr-3">
                              <span className="text-[#586e75]">{k}:</span>{" "}
                              <span className="text-[#d4af37]">
                                {JSON.stringify(v) ?? ""}
                              </span>
                            </span>
                          ))}
                        {!!item.url && (
                          <a
                            href={String(item.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#2aa198] hover:underline ml-2"
                          >
                            ↗ link
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Data tab */}
        {activeTab === "data" && (
          <div className="p-4 max-h-[50vh] overflow-y-auto space-y-4">
            {sections.map((section) => (
              <div key={section.category}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-[#d4af37]">
                    {section.label}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#001e26] text-[#586e75]">
                    {section.count} items
                  </span>
                </div>
                {section.items.length === 0 ? (
                  <p className="text-xs text-[#586e75] italic">No {section.label.toLowerCase()} in the last 24 hours</p>
                ) : (
                  <div className="space-y-2">
                    {section.items.slice(0, 5).map((item, i) => (
                      <div
                        key={i}
                        className="bg-[#001e26] rounded-lg p-3 border border-[#d4af37]/10"
                      >
                        {Object.entries(item).map(([k, v]) => {
                          if (k === "url") return null;
                          if (k === "labels" && Array.isArray(v)) {
                            return (
                              <div key={k} className="text-xs mt-1">
                                {v.map((label: string) => (
                                  <span
                                    key={label}
                                    className="inline-block px-1.5 py-0.5 rounded bg-[#d4af37]/10 text-[#d4af37] text-[10px] mr-1"
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          return (
                            <div key={k} className="text-xs">
                              <span className="text-[#586e75]">{k}:</span>{" "}
                              <span className="text-[#93a1a1]">
                                {JSON.stringify(v) ?? ""}
                              </span>
                            </div>
                          );
                        })}
                        {!!item.url && (
                          <a
                            href={String(item.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-[#2aa198] hover:underline mt-1 inline-block"
                          >
                            Open on GitHub ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        onTimeUpdate={() =>
          setCurrentTime(audioRef.current?.currentTime ?? 0)
        }
        onLoadedMetadata={() =>
          setDuration(audioRef.current?.duration ?? 0)
        }
        onEnded={() => setPlaying(false)}
        preload="auto"
      />
    </div>
  );
}
