"use client";

import { useState } from "react";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import type { Episode, ScriptSegment } from "@/lib/types";

export default function Home() {
  const [omUrl, setOmUrl] = useState("http://localhost:8585");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  async function handleConnect() {
    setStatus("Connecting to OpenMetadata...");
    setError("");
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: omUrl, token }),
      });
      const data = await res.json();
      if (data.ok) {
        setConnected(true);
        setSchemas(data.schemas ?? []);
        setStatus(`✓ Connected — ${data.schemas?.length ?? 0} schemas found`);
      } else {
        setError(data.error || "Connection failed");
        setStatus("");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
      setStatus("");
    }
  }

  async function handleGenerate(schemaFqn: string) {
    setGenerating(true);
    setError("");
    setProgress("Fetching metadata from OpenMetadata...");

    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: omUrl, token, schemaFqn }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Generation failed");
        setProgress("");
        return;
      }

      setProgress("Generating podcast script...");
      
      // Small delay to show progress
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setProgress("Synthesizing audio with ElevenLabs...");

      const script: ScriptSegment[] = JSON.parse(
        atob(res.headers.get("X-Episode-Script") ?? "W10=")
      );
      const tables = Number(res.headers.get("X-Episode-Tables") ?? "0");
      const testsTotal = Number(res.headers.get("X-Episode-Tests-Total") ?? "0");
      const testsFailed = Number(res.headers.get("X-Episode-Tests-Failed") ?? "0");
      const schemaName = schemaFqn.split(".").pop() ?? schemaFqn;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setEpisode({
        schemaFqn,
        schemaName,
        tableCount: tables,
        qualitySummary: { passed: testsTotal - testsFailed, failed: testsFailed, total: testsTotal },
        script,
        audioUrl: url,
      });
      setAudioUrl(url);
      setStatus("✓ Episode ready — hit play!");
      setProgress("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setProgress("");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-2">🎙️ DataBard</h1>
        <p className="text-[var(--text-muted)] text-lg">
          Podcast-style audio docs for your data catalog
        </p>
      </div>

      {!connected ? (
        <div className="flex flex-col gap-4 w-full max-w-md bg-[var(--surface)] p-6 rounded-xl border border-[var(--border)]">
          <label className="text-sm text-[var(--text-muted)]">OpenMetadata URL</label>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            value={omUrl}
            onChange={(e) => setOmUrl(e.target.value)}
            placeholder="http://localhost:8585"
          />
          <label className="text-sm text-[var(--text-muted)]">Auth Token</label>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token from OpenMetadata"
          />
          <button
            onClick={handleConnect}
            disabled={!omUrl || !token}
            className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Connect
          </button>
        </div>
      ) : episode && audioUrl ? (
        <div className="flex flex-col gap-4 w-full items-center">
          <EpisodePlayer episode={episode} audioUrl={audioUrl} />
          <button
            onClick={() => {
              setEpisode(null);
              setAudioUrl(null);
              setStatus("");
            }}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            ← Generate another episode
          </button>
        </div>
      ) : (
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Select a schema</h2>
            <span className="text-sm text-[var(--text-muted)]">{schemas.length} available</span>
          </div>
          {generating && progress && (
            <div className="bg-[var(--surface)] border border-[var(--accent)] rounded-lg px-4 py-3 flex items-center gap-3">
              <div className="animate-spin h-4 w-4 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
              <span className="text-sm text-[var(--text-muted)]">{progress}</span>
            </div>
          )}
          <div className="grid gap-2 max-h-96 overflow-y-auto">
            {schemas.map((s) => (
              <button
                key={s}
                onClick={() => handleGenerate(s)}
                disabled={generating}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-left hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                <div className="font-medium">{s.split(".").pop()}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">{s}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {status && (
        <p className="text-sm text-[var(--text-muted)]">{status}</p>
      )}
      
      {error && (
        <div className="bg-[var(--danger)]/10 border border-[var(--danger)] rounded-lg px-4 py-3 max-w-2xl">
          <p className="text-sm text-[var(--danger)]">⚠️ {error}</p>
        </div>
      )}
    </main>
  );
}
