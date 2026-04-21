"use client";

import { useState, useEffect } from "react";
import { EpisodePlayer } from "@/components/EpisodePlayer";
import { GenerationProgress } from "@/components/GenerationProgress";
import { ProviderStatus } from "@/components/ProviderStatus";
import type { Episode, DataSource } from "@/lib/types";

export default function Home() {
  const [source, setSource] = useState<DataSource>("openmetadata");
  const [omUrl, setOmUrl] = useState("http://localhost:8585");
  const [token, setToken] = useState("");
  const [dbtAccountId, setDbtAccountId] = useState("");
  const [dbtProjectId, setDbtProjectId] = useState("");
  const [dbtToken, setDbtToken] = useState("");

  const [connected, setConnected] = useState(false);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(-1);
  const [genSegments, setGenSegments] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [genStartedAt, setGenStartedAt] = useState(0);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [segmentOffsets, setSegmentOffsets] = useState<number[]>([]);
  const [showConnect, setShowConnect] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const [manifestFile, setManifestFile] = useState<File | null>(null);

  // Restore connection config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("databard:connection");
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.source) setSource(cfg.source);
        if (cfg.omUrl) setOmUrl(cfg.omUrl);
        if (cfg.token) setToken(cfg.token);
        if (cfg.dbtAccountId) setDbtAccountId(cfg.dbtAccountId);
        if (cfg.dbtProjectId) setDbtProjectId(cfg.dbtProjectId);
        if (cfg.dbtToken) setDbtToken(cfg.dbtToken);
      }
    } catch { /* ignore corrupt localStorage */ }
  }, []);

  // Persist connection config to localStorage (excluding sensitive tokens from localStorage for security)
  useEffect(() => {
    try {
      localStorage.setItem("databard:connection", JSON.stringify({
        source, omUrl, dbtAccountId, dbtProjectId,
      }));
    } catch { /* quota exceeded or private mode */ }
  }, [source, omUrl, dbtAccountId, dbtProjectId]);

  // Handle checkout cancellation return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancelled") {
      window.history.replaceState({}, "", "/");
    }
  }, []);

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
      setGenStep(2);
      setEpisode(demo);
      
      // Check if demo audio exists
      const audioCheck = await fetch("/demo-episode.mp3", { method: "HEAD" });
      if (audioCheck.ok) {
        setAudioUrl("/demo-episode.mp3");
      } else {
        setStatus("Demo loaded (audio requires ElevenLabs API key to generate)");
      }
      
      setStatus("");
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : "Failed to load demo"}`);
    } finally {
      setGenerating(false);
      setGenStep(-1);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setStatus("Connecting…");

    try {
      const body: Record<string, unknown> = { source };

      if (source === "openmetadata") {
        if (!omUrl || !token) { setStatus("Error: URL and token required"); setConnecting(false); return; }
        body.url = omUrl; body.token = token;
      } else if (source === "dbt-cloud") {
        if (!dbtAccountId || !dbtProjectId || !dbtToken) { setStatus("Error: All fields required"); setConnecting(false); return; }
        body.dbtCloud = { accountId: dbtAccountId, projectId: dbtProjectId, token: dbtToken };
      } else if (source === "dbt-local") {
        if (!manifestFile) { setStatus("Error: Please upload a manifest.json file"); setConnecting(false); return; }
        const text = await manifestFile.text();
        try { JSON.parse(text); } catch { setStatus("Error: Invalid JSON in manifest file"); setConnecting(false); return; }
        body.dbtLocal = { manifestContent: text };
      }

      const res = await fetch("/api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.ok) {
        setConnected(true);
        setSchemas(data.schemas ?? []);
        setStatus(`Connected — ${data.schemas?.length ?? 0} schemas found`);
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : "Connection failed"}`);
    } finally {
      setConnecting(false);
    }
  }

  async function handleGenerate(schemaFqn: string) {
    setGenerating(true);
    setGenStep(0);
    setGenSegments(0);
    setGenTotal(0);
    setGenStartedAt(0);
    setStatus(`Generating episode for ${schemaFqn}…`);

    try {
      const body: Record<string, unknown> = { schemaFqn, source };
      if (source === "openmetadata") { body.url = omUrl; body.token = token; }
      else if (source === "dbt-cloud") { body.dbtCloud = { accountId: dbtAccountId, projectId: dbtProjectId, token: dbtToken }; }
      else if (source === "dbt-local" && manifestFile) {
        const text = await manifestFile.text();
        body.dbtLocal = { manifestContent: text };
      }

      const res = await fetch("/api/synthesize-stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setStatus(`Error: ${res.statusText}`); return; }

      const reader = res.body?.getReader();
      if (!reader) { setStatus("Error: No response stream"); return; }

      const decoder = new TextDecoder();
      const audioChunks: ArrayBuffer[] = [];
      const chunkSizes: number[] = [];
      let metadata: Episode | null = null;
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        // Keep the last (potentially incomplete) line in the buffer
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let data: any;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.type === "metadata") {
            setGenStep(1);
            metadata = {
              schemaFqn: data.schemaFqn, schemaName: data.schemaName, tableCount: data.tableCount,
              qualitySummary: { passed: data.testsTotal - data.testsFailed, failed: data.testsFailed, total: data.testsTotal },
              script: data.script, schemaMeta: data.schemaMeta,
            };
          } else if (data.type === "estimate") {
            setGenTotal(data.segments);
            setGenStartedAt(Date.now());
            setStatus(`${data.totalCalls} API calls (${data.segments} speech + ${data.sfxCalls} SFX)`);
          } else if (data.type === "audio") {
            setGenStep(2);
            const audioData = Uint8Array.from(atob(data.data as string), (c) => c.charCodeAt(0));
            audioChunks.push(audioData.buffer as ArrayBuffer);
            chunkSizes.push(audioData.byteLength);
            if (data.segment !== undefined) setGenSegments((n) => n + 1);
            setStatus(`Synthesizing… ${audioChunks.length} segments`);
          } else if (data.type === "done" && metadata) {
            const blob = new Blob(audioChunks, { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            setEpisode({ ...metadata, audioUrl: url });
            setAudioUrl(url);

            // Compute proportional segment offsets from byte sizes
            // Audio chunks include: intro jingle, then for each segment optionally a transition + speech, then outro
            // We approximate time offsets proportional to byte sizes
            const totalBytes = chunkSizes.reduce((a, b) => a + b, 0);
            if (totalBytes > 0 && metadata.script.length > 0) {
              // Build a mapping: each script segment maps to one or more audio chunks
              // Chunk 0 = intro jingle. Then segments interleaved with optional transitions. Last = outro.
              let chunkIdx = 1; // skip intro
              const segByteStarts: number[] = [];
              let byteOffset = chunkSizes[0] ?? 0; // after intro

              for (let s = 0; s < metadata.script.length; s++) {
                segByteStarts.push(byteOffset);
                // Check if there was a transition before this segment (topic change)
                if (s > 0 && metadata.script[s].topic !== metadata.script[s - 1].topic) {
                  byteOffset += chunkSizes[chunkIdx] ?? 0; // transition
                  chunkIdx++;
                }
                byteOffset += chunkSizes[chunkIdx] ?? 0; // speech
                chunkIdx++;
              }

              // Convert byte offsets to time offsets (we don't know total duration yet, so use ratio)
              // We'll store byte-proportional ratios and multiply by duration in the player
              // Actually, store as fractions — the player will multiply by duration
              const offsets = segByteStarts.map((b) => b / totalBytes);
              setSegmentOffsets(offsets);
            }

            setStatus("");
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

  async function handleCheckout() {
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "team" }) });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setStatus(data.error || "Checkout not available yet");
  }

  function reset() {
    setEpisode(null); setAudioUrl(null); setSegmentOffsets([]); setConnected(false); setShowConnect(false); setStatus("");
  }

  const sourceHelp: Record<DataSource, string> = {
    openmetadata: "Run OpenMetadata locally with Docker, or connect to a hosted instance.",
    "dbt-cloud": "Find Account ID and Project ID in your dbt Cloud URL. Generate a token at Account Settings → API Access.",
    "dbt-local": "Run `dbt compile` first, then point to the generated manifest.json in your target/ directory.",
  };

  // ─── Episode player ───
  if (episode && audioUrl !== null) {
    return (
      <main className="min-h-screen flex flex-col items-center p-4 sm:p-8 gap-6">
        {/* Demo context banner */}
        {episode.schemaFqn === "analytics.ecommerce" && (
          <div className="w-full max-w-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl px-4 py-3 text-center animate-slide-up">
            <p className="text-xs text-[var(--text-muted)]">
              🎧 Demo episode analyzing a sample <span className="text-[var(--text)]">e-commerce schema</span> — 6 tables, 3 failing tests, PII governance gaps, and stale pipelines
            </p>
          </div>
        )}
        <EpisodePlayer episode={episode} audioUrl={audioUrl} segmentOffsets={segmentOffsets} />

        <div className="flex flex-col items-center gap-3">
          <button onClick={reset} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
            ← Generate another
          </button>

          {/* Post-experience upsell */}
          <div className="bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-4 max-w-md text-center animate-slide-up">
            <p className="text-sm mb-2">Want this for your team every week?</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Scheduled episodes, private feeds, Slack notifications — $29/mo
            </p>
            <button onClick={handleCheckout} className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-xs font-medium cursor-pointer">
              Start Pro trial
            </button>
          </div>
        </div>
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      </main>
    );
  }

  // ─── Generating ───
  if (generating) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
        <GenerationProgress currentStep={genStep} segmentsComplete={genSegments} segmentsTotal={genTotal} startedAt={genStartedAt} />
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      </main>
    );
  }

  // ─── Schema picker ───
  if (connected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Select a schema</h2>
            <button onClick={reset} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">← Back</button>
          </div>
          {schemas.length > 5 && (
            <input type="text" placeholder="Search schemas…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" />
          )}
          <div className="grid gap-2 max-h-96 overflow-y-auto">
            {filteredSchemas.length === 0
              ? <p className="text-sm text-[var(--text-muted)] text-center py-8">No schemas found</p>
              : filteredSchemas.map((s) => (
                <button key={s} onClick={() => handleGenerate(s)} disabled={generating}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-left hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {s}
                </button>
              ))
            }
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
      <section className="flex flex-col items-center text-center pt-12 sm:pt-20 pb-10 sm:pb-14 max-w-2xl">
        <p className="text-xs text-[var(--accent)] font-medium tracking-wider uppercase mb-4">Audio documentation for data teams</p>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
          Your data catalog,<br />as a podcast
        </h1>
        <p className="text-lg sm:text-xl text-[var(--text-muted)] mb-8 max-w-lg">
          Two AI hosts walk through your schemas, flag failing tests, trace lineage, and call out governance gaps — so your team actually knows what's in the warehouse.
        </p>

        <button
          onClick={handleDemo}
          className="bg-[var(--accent)] hover:brightness-110 text-white rounded-xl px-8 py-4 text-lg font-medium cursor-pointer transition-all hover:scale-[1.02] mb-3"
        >
          ▶ Listen to a demo episode
        </button>
        <p className="text-xs text-[var(--text-muted)]">No signup required · 30 seconds to hear it</p>
      </section>

      {/* Social proof */}
      <section className="flex flex-wrap justify-center gap-6 text-xs text-[var(--text-muted)] pb-12 sm:pb-16 max-w-2xl">
        <span>Built on <span className="text-[var(--text)]">OpenMetadata</span></span>
        <span>·</span>
        <span>Voices by <span className="text-[var(--text)]">ElevenLabs</span></span>
        <span>·</span>
        <span>Works with <span className="text-[var(--text)]">dbt</span></span>
      </section>

      {/* Why audio */}
      <section className="w-full max-w-3xl pb-12 sm:pb-16">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-2">Why a podcast?</h2>
        <p className="text-sm text-[var(--text-muted)] text-center mb-8 max-w-lg mx-auto">
          Your data catalog has hundreds of tables. Nobody reads the docs. But everyone listens to podcasts.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: "🎧", title: "Passive consumption", desc: "Listen while commuting, coding, or doing dishes. No screen required." },
            { icon: "⚠️", title: "Issues you'd miss", desc: "AI hosts flag failing tests, stale tables, PII columns, and missing owners." },
            { icon: "📊", title: "Click to explore", desc: "Hear something interesting? Click the segment to see columns, tests, and lineage." },
          ].map((item) => (
            <div key={item.title} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">{item.icon}</div>
              <h3 className="font-semibold mb-1">{item.title}</h3>
              <p className="text-sm text-[var(--text-muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="w-full max-w-3xl pb-12 sm:pb-16">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: "1", title: "Connect", desc: "Point at OpenMetadata, dbt Cloud, or a local manifest" },
            { step: "2", title: "Generate", desc: "AI analyzes your schema — health score, critical tables, lineage risks" },
            { step: "3", title: "Listen & share", desc: "Stream, download MP3, share via WhatsApp/Slack, or subscribe via RSS" },
          ].map((item) => (
            <div key={item.step} className="flex flex-col items-center text-center">
              <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-sm font-bold mb-3">{item.step}</div>
              <h3 className="font-semibold mb-1">{item.title}</h3>
              <p className="text-sm text-[var(--text-muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Connect CTA */}
      <section className="w-full max-w-md pb-12 sm:pb-16 flex flex-col gap-4">
        {/* What you'll get */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">What you get per episode</h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-2"><span className="text-[var(--accent)]">●</span> Health score & coverage</div>
            <div className="flex items-center gap-2"><span className="text-[var(--accent)]">●</span> Failing test breakdown</div>
            <div className="flex items-center gap-2"><span className="text-[var(--accent)]">●</span> Lineage risk analysis</div>
            <div className="flex items-center gap-2"><span className="text-[var(--accent)]">●</span> PII & governance flags</div>
            <div className="flex items-center gap-2"><span className="text-[var(--accent)]">●</span> Prioritized action items</div>
            <div className="flex items-center gap-2"><span className="text-[var(--accent)]">●</span> Shareable MP3 + link</div>
          </div>
        </div>

        {/* Provider Status */}
        <ProviderStatus />

        {!showConnect ? (
          <button onClick={() => setShowConnect(true)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] rounded-xl px-6 py-4 text-sm font-medium cursor-pointer transition-colors text-center">
            Connect your own data catalog →
          </button>
        ) : (
          <div className="flex flex-col gap-4 bg-[var(--surface)] p-6 rounded-xl border border-[var(--border)] animate-slide-up">
            <label className="text-sm text-[var(--text-muted)]">Data Source</label>
            <select className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm cursor-pointer"
              value={source} onChange={(e) => setSource(e.target.value as DataSource)}>
              <option value="openmetadata">OpenMetadata</option>
              <option value="dbt-cloud">dbt Cloud</option>
              <option value="dbt-local">dbt Local (manifest.json)</option>
            </select>
            <p className="text-xs text-[var(--text-muted)] -mt-2">{sourceHelp[source]}</p>

            {source === "openmetadata" && (<>
              <label className="text-sm text-[var(--text-muted)]">OpenMetadata URL</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={omUrl} onChange={(e) => setOmUrl(e.target.value)} placeholder="http://localhost:8585" title="The base URL of your OpenMetadata instance. Default is http://localhost:8585 for local Docker installs." />
              <label className="text-sm text-[var(--text-muted)]">Auth Token</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="JWT from Settings → Bots" title="Find this in OpenMetadata: Settings → Bots → Ingestion Bot → Copy Token. It's a long JWT string." />
            </>)}
            {source === "dbt-cloud" && (<>
              <label className="text-sm text-[var(--text-muted)]">Account ID</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={dbtAccountId} onChange={(e) => setDbtAccountId(e.target.value)} placeholder="From URL: cloud.getdbt.com/deploy/{id}" title="Find this in your dbt Cloud URL: cloud.getdbt.com/deploy/{account_id}/..." />
              <label className="text-sm text-[var(--text-muted)]">Project ID</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={dbtProjectId} onChange={(e) => setDbtProjectId(e.target.value)} placeholder="From URL: …/projects/{id}" title="Find this in your dbt Cloud URL: .../projects/{project_id}/..." />
              <label className="text-sm text-[var(--text-muted)]">API Token</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" autoComplete="off" value={dbtToken} onChange={(e) => setDbtToken(e.target.value)} placeholder="Account Settings → API Access" title="Generate at: dbt Cloud → Account Settings → API Access → Service Tokens. Needs 'Metadata Only' permission." />
            </>)}
            {source === "dbt-local" && (<>
              <label className="text-sm text-[var(--text-muted)]">Upload manifest.json</label>
              <div className="relative">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => setManifestFile(e.target.files?.[0] ?? null)}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm w-full file:mr-3 file:rounded file:border-0 file:bg-[var(--accent)] file:text-white file:px-3 file:py-1 file:text-xs file:cursor-pointer"
                />
                {manifestFile && (
                  <p className="text-xs text-[var(--success)] mt-1">✓ {manifestFile.name} ({(manifestFile.size / 1024).toFixed(0)} KB)</p>
                )}
              </div>
            </>)}

            {source !== "dbt-local" && (
              <p className="text-xs text-[var(--text-muted)] -mt-2 flex items-center gap-1">
                <span>🔒</span> Credentials are sent over HTTPS and stored only for this session
              </p>
            )}

            <button onClick={handleConnect} disabled={connecting} className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {connecting && <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {connecting ? "Connecting…" : "Connect"}
            </button>
          </div>
        )}
        {status && <p className="text-sm text-[var(--text-muted)] text-center mt-4">{status}</p>}
      </section>

      {/* Pricing — after they've seen the product */}
      <section className="w-full max-w-3xl pb-12 sm:pb-16" id="pricing">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-2">Plans</h2>
        <p className="text-sm text-[var(--text-muted)] text-center mb-8">Start free. Upgrade when your team needs scheduled episodes.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
            <h3 className="font-semibold text-lg mb-1">Free</h3>
            <p className="text-3xl font-bold mb-4">$0</p>
            <ul className="text-sm text-[var(--text-muted)] space-y-2 mb-6">
              <li>✓ Unlimited one-off episodes</li>
              <li>✓ All data sources</li>
              <li>✓ MP3 download & sharing</li>
              <li>✓ Interactive drill-down</li>
            </ul>
            <button onClick={handleDemo} className="w-full bg-[var(--border)] hover:bg-[var(--text-muted)]/20 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer">
              Try demo
            </button>
          </div>
          <div className="bg-[var(--surface)] border-2 border-[var(--accent)] rounded-xl p-6 relative">
            <span className="absolute -top-3 left-4 bg-[var(--accent)] text-white text-xs px-2 py-0.5 rounded-full">Pro</span>
            <h3 className="font-semibold text-lg mb-1">Team</h3>
            <p className="text-3xl font-bold mb-4">$29<span className="text-sm font-normal text-[var(--text-muted)]">/mo</span></p>
            <ul className="text-sm text-[var(--text-muted)] space-y-2 mb-6">
              <li>✓ Everything in Free</li>
              <li>✓ Scheduled daily/weekly episodes</li>
              <li>✓ Private team RSS feeds</li>
              <li>✓ Slack/webhook notifications</li>
              <li>✓ Historical comparison</li>
            </ul>
            <button onClick={handleCheckout} className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer">
              Start Pro
            </button>
            <a href="/pro" className="block text-center text-xs text-[var(--text-muted)] hover:text-[var(--text)] mt-2 cursor-pointer">
              Already subscribed? Manage schedules →
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="w-full max-w-3xl pb-12 sm:pb-16" id="faq">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">Questions</h2>
        <div className="flex flex-col gap-2">
          {[
            {
              q: "Is my data sent to your servers?",
              a: "Your credentials are stored server-side in an encrypted session that expires after 1 hour. We fetch metadata from your catalog to generate the episode, but we don't store your raw data. Audio and episode data are cached temporarily for sharing (24h for free, 7 days for Pro).",
            },
            {
              q: "Do I need an ElevenLabs account?",
              a: "For the demo, no. To generate episodes from your own data, you need an ElevenLabs API key (Starter plan at $5/mo is recommended for full API access). Free tier keys work with browser automation fallback but are slower.",
            },
            {
              q: "What data sources are supported?",
              a: "OpenMetadata (self-hosted or cloud), dbt Cloud (via API), and dbt Local (upload your manifest.json). We pull table metadata, column info, quality tests, lineage, owners, tags, and profiler data.",
            },
            {
              q: "How long does generation take?",
              a: "30-60 seconds depending on schema size. The AI analyzes your metadata, generates a two-host script, then synthesizes each segment as audio. You see real-time progress with segment-by-segment updates.",
            },
            {
              q: "Can I self-host DataBard?",
              a: "Yes. DataBard is a Next.js app that runs on any Node.js server. Clone the repo, set your API keys, and deploy. The file-backed store works on any persistent server. No database required.",
            },
            {
              q: "What are the two AI hosts?",
              a: "Alex is the enthusiastic data advocate who highlights what's working well. Morgan is the skeptical quality auditor who flags risks, failing tests, and governance gaps. Together they create a balanced, engaging walkthrough.",
            },
            {
              q: "What's the visual report feature?",
              a: "Click '📊 Report' on any episode to render a 3-slide visual dashboard (overview, critical tables, lineage & ownership) directly on your Paper canvas and download each slide as a high-res image. Requires Paper Desktop to be open.",
            },
            {
              q: "How does the free tier work?",
              a: "Unlimited one-off episodes, all data sources, MP3 download, sharing, and interactive drill-down. Pro adds scheduled episodes, private RSS feeds, Slack notifications, and historical comparison.",
            },
          ].map((item) => (
            <details key={item.q} className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl">
              <summary className="px-5 py-4 text-sm font-medium cursor-pointer list-none flex items-center justify-between">
                {item.q}
                <span className="text-[var(--text-muted)] group-open:rotate-45 transition-transform text-lg">+</span>
              </summary>
              <p className="px-5 pb-4 text-sm text-[var(--text-muted)] leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-xs text-[var(--text-muted)] pb-8 flex gap-3">
        <span>Powered by ElevenLabs & OpenMetadata</span>
        <span>·</span>
        <a href="/api/feed" className="hover:text-[var(--text)]">RSS Feed</a>
      </footer>
    </main>
  );
}
