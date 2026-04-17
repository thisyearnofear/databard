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
  const [generating, setGenerating] = useState(false);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  async function handleConnect() {
    setStatus("Connecting…");
    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: omUrl, token }),
    });
    const data = await res.json();
    if (data.ok) {
      setConnected(true);
      setSchemas(data.schemas ?? []);
      setStatus(`Connected — ${data.schemas?.length ?? 0} schemas found`);
    } else {
      setStatus(`Error: ${data.error}`);
    }
  }

  async function handleGenerate(schemaFqn: string) {
    setGenerating(true);
    setStatus(`Generating episode for ${schemaFqn}…`);

    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: omUrl, token, schemaFqn }),
      });

      if (!res.ok) {
        const err = await res.json();
        setStatus(`Error: ${err.error}`);
        return;
      }

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
      setStatus("Episode ready — hit play!");
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
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
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
            value={omUrl}
            onChange={(e) => setOmUrl(e.target.value)}
          />
          <label className="text-sm text-[var(--text-muted)]">Auth Token</label>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token from OpenMetadata"
          />
          <button
            onClick={handleConnect}
            className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          >
            Connect
          </button>
        </div>
      ) : episode && audioUrl ? (
        <EpisodePlayer episode={episode} audioUrl={audioUrl} />
      ) : (
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Select a schema</h2>
          <div className="grid gap-2">
            {schemas.map((s) => (
              <button
                key={s}
                onClick={() => handleGenerate(s)}
                disabled={generating}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-left hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {status && (
        <p className="text-sm text-[var(--text-muted)]">{status}</p>
      )}
    </main>
  );
}
