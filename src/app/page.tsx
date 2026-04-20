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
  const [checkoutMsg, setCheckoutMsg] = useState("");

  // Handle checkout return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setCheckoutMsg("🎉 Welcome to DataBard Pro! Check your email for setup instructions.");
      window.history.replaceState({}, "", "/");
    } else if (params.get("checkout") === "cancelled") {
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
    setStatus("Connecting…");
    const body: Record<string, unknown> = { source };

    if (source === "openmetadata") {
      if (!omUrl || !token) { setStatus("Error: URL and token required"); return; }
      body.url = omUrl; body.token = token;
    } else if (source === "dbt-cloud") {
      if (!dbtAccountId || !dbtProjectId || !dbtToken) { setStatus("Error: All fields required"); return; }
      body.dbtCloud = { accountId: dbtAccountId, projectId: dbtProjectId, token: dbtToken };
    } else if (source === "dbt-local") {
      if (!manifestPath) { setStatus("Error: Manifest path required"); return; }
      body.dbtLocal = { manifestPath };
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
  }

  async function handleGenerate(schemaFqn: string) {
    setGenerating(true);
    setGenStep(0);
    setStatus(`Generating episode for ${schemaFqn}…`);

    try {
      const body: Record<string, unknown> = { schemaFqn, source };
      if (source === "openmetadata") { body.url = omUrl; body.token = token; }
      else if (source === "dbt-cloud") { body.dbtCloud = { accountId: dbtAccountId, projectId: dbtProjectId, token: dbtToken }; }
      else if (source === "dbt-local") { body.dbtLocal = { manifestPath }; }

      const res = await fetch("/api/synthesize-stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === "metadata") {
            setGenStep(1);
            metadata = {
              schemaFqn: data.schemaFqn, schemaName: data.schemaName, tableCount: data.tableCount,
              qualitySummary: { passed: data.testsTotal - data.testsFailed, failed: data.testsFailed, total: data.testsTotal },
              script: data.script, schemaMeta: data.schemaMeta,
            };
          } else if (data.type === "estimate") {
            setStatus(`${data.totalCalls} API calls (${data.segments} speech + ${data.sfxCalls} SFX)`);
          } else if (data.type === "audio") {
            setGenStep(2);
            const audioData = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
            audioChunks.push(audioData.buffer as ArrayBuffer);
            setStatus(`Synthesizing… ${audioChunks.length} segments`);
          } else if (data.type === "done" && metadata) {
            const blob = new Blob(audioChunks, { type: "audio/mpeg" });
            setEpisode({ ...metadata, audioUrl: URL.createObjectURL(blob) });
            setAudioUrl(URL.createObjectURL(blob));
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
    setEpisode(null); setAudioUrl(null); setConnected(false); setShowConnect(false); setStatus("");
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
        <EpisodePlayer episode={episode} audioUrl={audioUrl} />

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
        <GenerationProgress currentStep={genStep} />
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
                <button key={s} onClick={() => handleGenerate(s)}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-left hover:border-[var(--accent)] transition-colors cursor-pointer">
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
      {checkoutMsg && (
        <div className="w-full max-w-2xl bg-[var(--success)]/20 border border-[var(--success)] rounded-xl p-4 text-center text-sm mt-4 mb-4">
          {checkoutMsg}
        </div>
      )}

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
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={omUrl} onChange={(e) => setOmUrl(e.target.value)} placeholder="http://localhost:8585" />
              <label className="text-sm text-[var(--text-muted)]">Auth Token</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="JWT from Settings → Bots" />
            </>)}
            {source === "dbt-cloud" && (<>
              <label className="text-sm text-[var(--text-muted)]">Account ID</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={dbtAccountId} onChange={(e) => setDbtAccountId(e.target.value)} placeholder="From URL: cloud.getdbt.com/deploy/{id}" />
              <label className="text-sm text-[var(--text-muted)]">Project ID</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={dbtProjectId} onChange={(e) => setDbtProjectId(e.target.value)} placeholder="From URL: …/projects/{id}" />
              <label className="text-sm text-[var(--text-muted)]">API Token</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" type="password" value={dbtToken} onChange={(e) => setDbtToken(e.target.value)} placeholder="Account Settings → API Access" />
            </>)}
            {source === "dbt-local" && (<>
              <label className="text-sm text-[var(--text-muted)]">Manifest Path</label>
              <input className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" value={manifestPath} onChange={(e) => setManifestPath(e.target.value)} placeholder="./target/manifest.json" />
            </>)}

            <button onClick={handleConnect} className="bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2 text-sm font-medium cursor-pointer">Connect</button>
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
          </div>
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
