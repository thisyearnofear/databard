"use client";

import { useState } from "react";
import { BriefingPlayer } from "./components/BriefingPlayer";

interface BriefingResult {
  ok: boolean;
  repo?: string;
  script?: Array<{
    id: string;
    speaker: string;
    topic: string;
    text: string;
    dataItems?: Record<string, unknown>[];
  }>;
  sections?: Array<{
    category: string;
    label: string;
    count: number;
    items: Record<string, unknown>[];
  }>;
  audio?: string;
  audioError?: string;
  error?: string;
}

export default function BriefingPage() {
  const [repo, setRepo] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<BriefingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  async function handleRegenerate() {
    if (!repo.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: repo.trim(),
          githubToken: githubToken.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || "Failed to generate briefing");
        return;
      }

      setResult(data);

      if (data.audio) {
        const bytes = Uint8Array.from(atob(data.audio), (c) =>
          c.charCodeAt(0)
        );
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    await handleRegenerate();
  }

  return (
    <div className="min-h-screen bg-[#002b36] pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold text-[#d4af37] font-title">
            🏴‍☠️ Dev Morning Briefing
          </h1>
          <p className="text-[#93a1a1] text-lg max-w-xl mx-auto">
            What happened on your repo overnight? Coral queries GitHub and two
            AI hosts break it down while you make coffee.
          </p>
          <p className="text-xs text-[#586e75]">
            Powered by{" "}
            <a
              href="https://withcoral.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2aa198] hover:underline"
            >
              Coral
            </a>{" "}
            · Built for Pirates of the Coral-bean Hackathon
          </p>
        </div>

        {/* Input form */}
        <form
          onSubmit={handleGenerate}
          className="bg-[#112130] border border-[#d4af37]/20 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-sm text-[#93a1a1] mb-1.5">
              Repository
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/repo (e.g., vercel/next.js)"
              className="w-full bg-[#001e26] border border-[#d4af37]/20 rounded-lg px-4 py-3 text-[#fdf6e3] text-sm placeholder:text-[#586e75] focus:outline-none focus:border-[#d4af37]/50"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#93a1a1] mb-1.5">
              GitHub Token{" "}
              <span className="text-[#586e75] text-xs">(optional)</span>
            </label>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_... or leave empty to use Coral's config"
              className="w-full bg-[#001e26] border border-[#d4af37]/20 rounded-lg px-4 py-3 text-[#fdf6e3] text-sm placeholder:text-[#586e75] focus:outline-none focus:border-[#d4af37]/50"
            />
            <p className="text-[10px] text-[#586e75] mt-1">
              Token stays on your machine — sent only to Coral (runs locally).
              Read-only access is enough.
            </p>
          </div>

          <button
            type="submit"
            disabled={generating || !repo.trim()}
            className="w-full py-3 rounded-lg bg-[#d4af37] hover:brightness-110 text-[#002b36] font-bold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-pulse">⚡</span>
                Querying GitHub via Coral...
              </span>
            ) : (
              "⚡ Generate Morning Briefing"
            )}
          </button>
        </form>

        {/* How it works */}
        {!result && !generating && (
          <div className="bg-[#112130] border border-[#d4af37]/20 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[#d4af37] mb-4">
              ⚓ How it works
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  step: "1",
                  title: "Coral Queries",
                  desc: "Coral runs 4 SQL queries against GitHub — open PRs, merges, new issues, and recent commits — all in one shot.",
                },
                {
                  step: "2",
                  title: "AI Script",
                  desc: "An LLM turns the activity into a conversational two-host podcast between Alex (enthusiast) and Morgan (skeptic).",
                },
                {
                  step: "3",
                  title: "Audio Briefing",
                  desc: "ElevenLabs TTS synthesizes the script into a professional podcast. Play it, download it, or share it with your team.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="bg-[#001e26] rounded-lg p-4 border border-[#d4af37]/10"
                >
                  <div className="text-[#d4af37] text-lg font-bold mb-2">
                    {item.step}
                  </div>
                  <h4 className="text-sm font-medium text-[#93a1a1] mb-1">
                    {item.title}
                  </h4>
                  <p className="text-xs text-[#586e75] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prerequisites */}
        {!result && !generating && (
          <div className="bg-[#112130] border border-[#d4af37]/20 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[#d4af37] mb-3">
              🧭 Prerequisites
            </h3>
            <div className="space-y-2 text-xs text-[#93a1a1]">
              <div className="flex items-start gap-2">
                <span className="text-[#2aa198] mt-0.5">✓</span>
                <span>
                  <code className="text-[#b58900] bg-[#001e26] px-1 py-0.5 rounded">
                    brew install withcoral/tap/coral
                  </code>{" "}
                  — Coral must be installed
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#2aa198] mt-0.5">✓</span>
                <span>
                  <code className="text-[#b58900] bg-[#001e26] px-1 py-0.5 rounded">
                    coral source add github
                  </code>{" "}
                  — GitHub source configured with a valid token
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#2aa198] mt-0.5">✓</span>
                <span>
                  <code className="text-[#b58900] bg-[#001e26] px-1 py-0.5 rounded">
                    ELEVENLABS_API_KEY
                  </code>{" "}
                  — Set in your environment for audio synthesis
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#b58900] mt-0.5">⚡</span>
                <span>
                  <code className="text-[#b58900] bg-[#001e26] px-1 py-0.5 rounded">
                    OPENAI_API_KEY
                  </code>{" "}
                  — Optional, enables AI-generated scripts (falls back to
                  templates)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {generating && (
          <div className="bg-[#112130] border border-[#d4af37]/20 rounded-xl p-12 text-center animate-pulse">
            <div className="text-4xl mb-4">⚡</div>
            <p className="text-[#d4af37] text-lg font-bold mb-2">
              Querying GitHub via Coral...
            </p>
            <p className="text-[#586e75] text-sm">
              Running 4 SQL queries, generating script, synthesizing audio
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-[#dc322f]/10 border border-[#dc322f]/30 rounded-xl p-4">
            <p className="text-sm text-[#dc322f] font-medium mb-1">
              Something went wrong
            </p>
            <p className="text-xs text-[#dc322f]/80">{error}</p>
            <p className="text-xs text-[#586e75] mt-2">
              Make sure Coral is installed and GitHub is configured as a source:
              <code className="block mt-1 text-[#93a1a1] bg-[#001e26] p-2 rounded">
                coral source add github
              </code>
            </p>
          </div>
        )}

        {/* Results */}
        {result && result.script && (
          <BriefingPlayer
            repo={result.repo || repo}
            script={result.script}
            sections={result.sections || []}
            audioUrl={audioUrl}
            audioError={result.audioError || null}
            onRegenerate={handleRegenerate}
            generating={generating}
          />
        )}
      </div>
    </div>
  );
}
