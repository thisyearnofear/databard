"use client";

import { useState } from "react";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import type { Episode, ScriptSegment, DataSource } from "@/lib/types";

export default function Home() {
  const [source, setSource] = useState<DataSource>("openmetadata");
  
  // OpenMetadata
  const [omUrl, setOmUrl] = useState("http://localhost:8585");
  const [token, setToken] = useState("");
  
  // dbt Cloud
  const [dbtAccountId, setDbtAccountId] = useState("");
  const [dbtProjectId, setDbtProjectId] = useState("");
  const [dbtToken, setDbtToken] = useState("");
  
  // dbt Local
  const [manifestPath, setManifestPath] = useState("./target/manifest.json");
  
  const [connected, setConnected] = useState(false);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const filteredSchemas = schemas.filter((s) =>
    s.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleConnect() {
    setStatus("Connecting…");
    
    const body: Record<string, unknown> = { source };
    
    if (source === "openmetadata") {
      if (!omUrl || !token) {
        setStatus("Error: URL and token required");
        return;
      }
      body.url = omUrl;
      body.token = token;
    } else if (source === "dbt-cloud") {
      if (!dbtAccountId || !dbtProjectId || !dbtToken) {
        setStatus("Error: Account ID, Project ID, and token required");
        return;
      }
      body.dbtCloud = { accountId: dbtAccountId, projectId: dbtProjectId, token: dbtToken };
    } else if (source === "dbt-local") {
      if (!manifestPath) {
        setStatus("Error: Manifest path required");
        return;
      }
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

      // Use streaming API
      const res = await fetch("/api/synthesize-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setStatus(`Error: ${res.statusText}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStatus("Error: No response stream");
        return;
      }

      const decoder = new TextDecoder();
      const audioChunks: Uint8Array[] = [];
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
            setStatus("Synthesizing audio…");
          } else if (data.type === "audio") {
            const audioData = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
            audioChunks.push(audioData);
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
    }
  }

  function renderConnectionForm() {
    if (source === "openmetadata") {
      return (
        <>
          <label className="text-sm text-[var(--text-muted)]">OpenMetadata URL</label>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
            value={omUrl}
            onChange={(e) => setOmUrl(e.target.value)}
            placeholder="http://localhost:8585"
          />
          <label className="text-sm text-[var(--text-muted)]">Auth Token</label>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token from OpenMetadata"
          />
        </>
      );
    } else if (source === "dbt-cloud") {
      return (
        <>
          <label className="text-sm text-[var(--text-muted)]">Account ID</label>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
            value={dbtAccountId}
            onChange={(e) => setDbtAccountId(e.target.value)}
            placeholder="12345"
          />
          <label className="text-sm text-[var(--text-muted)]">Project ID</label>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
            value={dbtProjectId}
            onChange={(e) => setDbtProjectId(e.target.value)}
            placeholder="67890"
          />
          <label className="text-sm text-[var(--text-muted)]">API Token</label>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
            type="password"
            value={dbtToken}
            onChange={(e) => setDbtToken(e.target.value)}
            placeholder="dbt Cloud API token"
          />
        </>
      );
    } else {
      return (
        <>
          <label className="text-sm text-[var(--text-muted)]">Manifest Path</label>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
            value={manifestPath}
            onChange={(e) => setManifestPath(e.target.value)}
            placeholder="./target/manifest.json"
          />
        </>
      );
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
          
          {renderConnectionForm()}
          
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
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Select a schema</h2>
            <button
              onClick={() => {
                setConnected(false);
                setEpisode(null);
                setAudioUrl(null);
              }}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
            >
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
              <p className="text-sm text-[var(--text-muted)] text-center py-8">
                No schemas found
              </p>
            ) : (
              filteredSchemas.map((s) => (
                <button
                  key={s}
                  onClick={() => handleGenerate(s)}
                  disabled={generating}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-left hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  {s}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {status && (
        <p className="text-sm text-[var(--text-muted)]">{status}</p>
      )}
    </main>
  );
}
