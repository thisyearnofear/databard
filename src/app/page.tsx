"use client";

import { useState } from "react";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import { GenerationProgress } from "@/components/GenerationProgress";
import type { Episode, DataSource } from "@/lib/types";

export default function Home() {
  const [source, setSource] = useState<DataSource>("openmetadata");
  const [omUrl, setOmUrl] = useState("http://localhost:8585");
  const [token, setToken] = useState("");
  const [dbtAccountId, setDbtAccountId] = useState("");
  const [dbtProjectId, setDbtProjectId] = useState("");
  const [dbtToken, setDbtToken] = useState("");
  const [manifestPath, setManifestPath] = useState("./target/manifest.json");

  const [connected, setConnected] = useState(false);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(-1);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  const filteredSchemas = schemas.filter((s) =>
    s.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleDemo() {
    setGenerating(true);
    setGenStep(0);
    setStatus("Loading demo…");

    try {
      const res = await fetch("/sample-episode.json");
      const demo: Episode = await res.json();
      setGenStep(1);

      // Try to synthesize with ElevenLabs, fall back to bundled silent MP3
      try {
        const synthRes = await fetch("/api/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: demo.script }),
        });

        if (synthRes.ok) {
          setGenStep(2);
          const data = await synthRes.json();
          if (data.ok && data.audio) {
            const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: "audio/mpeg" });
            setEpisode(demo);
            setAudioUrl(URL.createObjectURL(blob));
            setStatus("Demo episode ready — hit play!");
            return;
          }
        }
      } catch {
        // ElevenLabs unavailable — fall through to bundled audio
      }

      // Fallback: use bundled demo MP3
      setGenStep(2);
      setEpisode(demo);
      setAudioUrl("/demo-episode.mp3");
      setStatus("Demo loaded — connect your catalog for AI-voiced episodes");
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : "Failed to load demo"}`);
    } finally {
      setGenerating(false);
      setGenStep(-1);
    }
  }

  async function handleConnect() {
    setStatus("Connecting…");

    const body: Record<string, unknown> = { source };

    if (source === "openmetadata") {
      if (!omUrl || !token) { setStatus("Error: URL and token required"); return; }
      body.url = omUrl;
      body.token = token;
    } else if (source === "dbt-cloud") {
      if (!dbtAccountId || !dbtProjectId || !dbtToken) { setStatus("Error: Account ID, Project ID, and token required"); return; }
      body.dbtCloud = { accountId: dbtAccountId, projectId: dbtProjectId, token: dbtToken };
    } else if (source === "dbt-local") {
      if (!manifestPath) { setStatus("Error: Manifest path required"); return; }
      body.dbtLocal = { manifestPath };
    }

    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      setConnected(true);
      setSchemas(data.schemas ?? []);
      setStatus(`Connected to ${data.source} — ${data.schemas?.length ?? 0} schemas found`);
    } else {
      setStatus(`Error: ${data.error}`);
    }
  }

  async function handleGenerate(schemaFqn: string) {
    setGenerating(true);
    setGenStep(0);
    setStatus(`Generating episode for ${schemaFqn}…`);

    try {
      const body: Record<string, unknown> = { schemaFqn, source };

      if (source === "openmetadata") {
        body.url = omUrl;
        body.token = token;
      } else if (source === "dbt-cloud") {
        body.dbtCloud = { accountId: dbtAccountId, projectId: dbtProjectId, token: dbtToken };
      } else if (source === "dbt-local") {
        body.dbtLocal = { manifestPath };
      }

      const res = await fetch("/api/synthesize-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) { setStatus(`Error: ${res.statusText}`); return; }

      const reader = res.body?.getReader();
      if (!reader) { setStatus("Error: No response stream"); return; }

      const decoder = new TextDecoder();
      const audioChunks: ArrayBuffer[] = [];
      let metadata: Episode | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === "metadata") {
            setGenStep(1);
            metadata = {
              schemaFqn: data.schemaFqn,
              schemaName: data.schemaName,
              tableCount: data.tableCount,
              qualitySummary: {
                passed: data.testsTotal - data.testsFailed,
                failed: data.testsFailed,
                total: data.testsTotal,
              },
              script: data.script,
            };
          } else if (data.type === "estimate") {
            setStatus(`${data.totalCalls} API calls (${data.segments} speech + ${data.sfxCalls} SFX)`);
          } else if (data.type === "audio") {
            setGenStep(2);
            const audioData = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
            audioChunks.push(audioData.buffer as ArrayBuffer);
            setStatus(`Synthesizing… ${audioChunks.length} segments`);
          } else if (data.type === "done") {
            if (metadata) {
              const blob = new Blob(audioChunks, { type: "audio/mpeg" });
              const url = URL.createObjectURL(blob);
              setEpisode({ ...metadata, audioUrl: url });
              setAudioUrl(url);
              setStatus("Episode ready — hit play!");
            }
          } else if (data.type === "error") {
            setStatus(`Error: ${data.error}`);
          }
        }
      }
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setGenerating(false);
      setGenStep(-1);
    }
  }

  function reset() {
    setEpisode(null);
    setAudioUrl(null);
    setConnected(false);
    setShowConnect(false);
    setStatus("");
  }

  const sourceHelp: Record<DataSource, string> = {
    openmetadata: "Run OpenMetadata locally with Docker, or connect to a hosted instance.",
    "dbt-cloud": "Find Account ID and Project ID in your dbt Cloud URL. Generate a token at Account Settings → API Access.",
    "dbt-local": "Run `dbt compile` first, then point to the generated manifest.json in your target/ directory.",
  };

  // ─── Episode player view ───
  if (episode && audioUrl !== null) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
        <EpisodePlayer episode={episode} audioUrl={audioUrl} />
        <button onClick={reset} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
          ← Generate another
        </button>
      </main>
    );
  }

  // ─── Generating view ───
  if (generating) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
        <GenerationProgress currentStep={genStep} />
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      </main>
    );
  }

  // ─── Schema picker view ───
  if (connected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Select a schema</h2>
            <button onClick={reset} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
              ← Change source
            </button>
          </div>

          {schemas.length > 5 && (
            <input
              type="text"
              placeholder="Search schemas…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
            />
          )}

          <div className="grid gap-2 max-h-96 overflow-y-auto">
            {filteredSchemas.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-8">No schemas found</p>
            ) : (
              filteredSchemas.map((s) => (
                <button
                  key={s}
                  onClick={() => handleGenerate(s)}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-left hover:border-[var(--accent)] transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))
            )}
          </div>
        </div>
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      </main>
    );
  }

  // ─── Landing page ───
  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-8">
      {/* Hero */}
      <section className="flex flex-col items-center text-center pt-16 sm:pt-24 pb-12 sm:pb-16 max-w-2xl">
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
          Turn your data catalog into a podcast
        </h1>
        <p className="text-lg sm:text-xl text-[var(--text-muted)] mb-8 max-w-lg">
          Two AI hosts walk through your schemas, debate tradeoffs, and flag quality issues — so your team actually knows what's in the warehouse.
        </p>

        <button
          onClick={handleDemo}
          className="bg-[var(--accent)] hover:brightness-110 text-white rounded-xl px-8 py-4 text-lg font-medium cursor-pointer transition-all hover:scale-[1.02] mb-3"
        >
          ▶ Listen to a demo episode
        </button>
        <p className="text-xs text-[var(--text-muted)]">No signup, no API keys — hear it instantly</p>
      </section>

      {/* How it works */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 w-full max-w-3xl pb-12 sm:pb-16">
        {[
          { icon: "📊", title: "Connect", desc: "Point at OpenMetadata, dbt Cloud, or a local manifest.json" },
          { icon: "✍️", title: "Generate", desc: "AI writes a podcast script from your schema metadata and quality tests" },
          { icon: "🎙️", title: "Listen", desc: "Two distinct voices discuss your data — stream it, share it, download it" },
        ].map((step) => (
          <div key={step.title} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center">
            <div className="text-2xl mb-2">{step.icon}</div>
            <h3 className="font-semibold mb-1">{step.title}</h3>
            <p className="text-sm text-[var(--text-muted)]">{step.desc}</p>
          </div>
        ))}
      </section>

      {/* Connect CTA */}
      <section className="w-full max-w-md pb-16">
        {!showConnect ? (
          <button
            onClick={() => setShowConnect(true)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] rounded-xl px-6 py-4 text-sm font-medium cursor-pointer transition-colors text-center"
          >
            Connect your own data catalog →
          </button>
        ) : (
          <div className="flex flex-col gap-4 bg-[var(--surface)] p-6 rounded-xl border border-[var(--border)] animate-slide-up">
            <label className="text-sm text-[var(--text-muted)]">Data Source</label>
            <select
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm cursor-pointer"
              value={source}
              onChange={(e) => setSource(e.target.value as DataSource)}
            >
              <option value="openmetadata">OpenMetadata</option>
              <option value="dbt-cloud">dbt Cloud</option>
              <option value="dbt-local">dbt Local (manifest.json)</option>
            </select>

            <p className="text-xs text-[var(--text-muted)] -mt-2">{sourceHelp[source]}</p>

            {source === "openmetadata" && (
              <>
                <label className="text-sm text-[var(--text-muted)]">OpenMetadata URL</label>
                <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={omUrl} onChange={(e) => setOmUrl(e.target.value)} placeholder="http://localhost:8585" />
                <label className="text-sm text-[var(--text-muted)]">Auth Token</label>
                <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="JWT from OpenMetadata → Settings → Bots" />
              </>
            )}
            {source === "dbt-cloud" && (
              <>
                <label className="text-sm text-[var(--text-muted)]">Account ID</label>
                <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={dbtAccountId} onChange={(e) => setDbtAccountId(e.target.value)} placeholder="From URL: cloud.getdbt.com/deploy/{account_id}" />
                <label className="text-sm text-[var(--text-muted)]">Project ID</label>
                <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={dbtProjectId} onChange={(e) => setDbtProjectId(e.target.value)} placeholder="From URL: …/projects/{project_id}" />
                <label className="text-sm text-[var(--text-muted)]">API Token</label>
                <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" value={dbtToken} onChange={(e) => setDbtToken(e.target.value)} placeholder="Account Settings → API Access → Service Tokens" />
              </>
            )}
            {source === "dbt-local" && (
              <>
                <label className="text-sm text-[var(--text-muted)]">Manifest Path</label>
                <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={manifestPath} onChange={(e) => setManifestPath(e.target.value)} placeholder="./target/manifest.json" />
              </>
            )}

            <button onClick={handleConnect} className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer">
              Connect
            </button>
          </div>
        )}

        {status && <p className="text-sm text-[var(--text-muted)] text-center mt-4">{status}</p>}
      </section>

      {/* Footer */}
      <footer className="text-xs text-[var(--text-muted)] pb-8">
        Powered by ElevenLabs · Built with Next.js
      </footer>
    </main>
  );
}
