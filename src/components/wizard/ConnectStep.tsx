"use client";

import { useWizard } from "./wizard-context";
import { useToast } from "@/components/Toast";
import type { DataSource } from "@/lib/types";

const DEFAULT_OM_SANDBOX_URL = process.env.NEXT_PUBLIC_OM_SANDBOX_URL || "https://sandbox.open-metadata.org";

const DATA_SOURCES: { value: DataSource; label: string; emoji: string }[] = [
  { value: "openmetadata", label: "OpenMetadata", emoji: "🔍" },
  { value: "dbt-cloud", label: "dbt Cloud", emoji: "☁️" },
  { value: "dbt-local", label: "dbt Local", emoji: "💻" },
  { value: "the-graph", label: "The Graph", emoji: "🔗" },
  { value: "dune", label: "Dune", emoji: "🏜️" },
  { value: "coral", label: "Coral", emoji: "🪸" },
];

export function ConnectStep() {
  const { state, dispatch, showConnect, connected, sourceLabel, sourceHelp } = useWizard();
  const { toast } = useToast();
  
  function showError(message: string) {
    toast(message, "error");
    dispatch({ type: "SET_STATUS", status: `Error: ${message}` });
  }
  
  async function buildConnectBody(): Promise<Record<string, unknown> | null> {
    const body: Record<string, unknown> = { source: state.source };
    
    if (state.source === "openmetadata") {
      body.omMode = state.omMode;
      if (state.omMode === "sandbox") {
        if (state.token) body.token = state.token;
      } else {
        if (!state.omUrl || !state.token) { showError("URL and token required for custom instance"); return null; }
        body.url = state.omUrl;
        body.token = state.token;
      }
    } else if (state.source === "dbt-cloud") {
      if (!state.dbtAccountId || !state.dbtProjectId || !state.dbtToken) { showError("All fields required"); return null; }
      body.dbtCloud = { accountId: state.dbtAccountId, projectId: state.dbtProjectId, token: state.dbtToken };
    } else if (state.source === "dbt-local") {
      if (!state.manifestFile) { showError("Please upload a manifest.json file"); return null; }
      const text = await state.manifestFile.text();
      try { JSON.parse(text); } catch { showError("Invalid JSON in manifest file"); return null; }
      body.dbtLocal = { manifestContent: text };
    } else if (state.source === "the-graph") {
      if (!state.graphUrl) { showError("Subgraph URL required"); return null; }
      body.theGraph = { subgraphUrl: state.graphUrl, apiKey: state.graphApiKey || undefined };
    } else if (state.source === "dune") {
      if (!state.duneApiKey) { showError("Dune API key required"); return null; }
      body.dune = { apiKey: state.duneApiKey, namespace: state.duneNamespace || undefined, queryUrl: state.duneQueryUrl || undefined };
    } else if (state.source === "coral") {
      if (!state.coralQuery) { showError("Coral query required"); return null; }
      body.coral = { query: state.coralQuery };
    }
    
    return body;
  }
  
  async function handleTestConnection() {
    dispatch({ type: "SET_CONNECTION_TESTED", tested: "testing" });
    dispatch({ type: "SET_STATUS", status: "" });
    const body = await buildConnectBody();
    if (!body) { dispatch({ type: "SET_CONNECTION_TESTED", tested: "error" }); return; }
    
    try {
      const res = await fetch("/api/connect", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(body) 
      });
      const data = await res.json();
      if (data.ok) {
        dispatch({ type: "SET_CONNECTION_TESTED", tested: "success" });
        dispatch({ type: "SET_STATUS", status: `✓ Connection valid — ${(data.schemas ?? []).length} schemas available` });
      } else {
        dispatch({ type: "SET_CONNECTION_TESTED", tested: "error" });
        dispatch({ type: "SET_STATUS", status: `✗ ${data.error}` });
      }
    } catch (e: unknown) {
      dispatch({ type: "SET_CONNECTION_TESTED", tested: "error" });
      dispatch({ type: "SET_STATUS", status: `✗ ${e instanceof Error ? e.message : "Connection failed"}` });
    }
  }
  
  async function handleConnect() {
    dispatch({ type: "SET_CONNECTING", connecting: true });
    dispatch({ type: "SET_STATUS", status: "Connecting…" });
    
    const body = await buildConnectBody();
    if (!body) { dispatch({ type: "SET_CONNECTING", connecting: false }); return; }
    
    try {
      const res = await fetch("/api/connect", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(body) 
      });
      const data = await res.json();
      if (data.ok) {
        const nextSchemas = data.schemas ?? [];
        dispatch({ type: "SET_STATUS", status: `Connected — ${nextSchemas.length} schemas found` });
        connected(nextSchemas);
      } else {
        showError(data.error);
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      dispatch({ type: "SET_CONNECTING", connecting: false });
    }
  }
  
  async function handleQuickSandbox() {
    // Submit lead email if provided (fire-and-forget)
    if (state.leadEmail.trim()) {
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.leadEmail.trim(), source: "sandbox" }),
      }).catch(() => {});
    }
    
    dispatch({ type: "SET_SHOW_EMAIL_GATE", show: false });
    dispatch({ type: "SET_SOURCE", source: "openmetadata" });
    dispatch({ type: "SET_OM_MODE", omMode: "sandbox" });
    dispatch({ type: "SET_CONNECTING", connecting: true });
    dispatch({ type: "SET_STATUS", status: "Connecting to sandbox…" });
    
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "openmetadata", omMode: "sandbox" }),
      });
      const data = await res.json();
      if (data.ok) {
        const nextSchemas = data.schemas ?? [];
        dispatch({ type: "SET_STATUS", status: `Connected — ${nextSchemas.length} schemas found` });
        connected(nextSchemas);
      } else {
        dispatch({ type: "SET_STATUS", status: `Sandbox requires a token — ${data.error}` });
        dispatch({ type: "SET_CONNECTING", connecting: false });
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Connection failed");
      dispatch({ type: "SET_CONNECTING", connecting: false });
    }
  }
  
  return (
    <div className="w-full max-w-md">
      <h2 className="text-xl font-semibold mb-1">Connect your data</h2>
      <p className="text-sm text-[var(--text-muted)] mb-6">{sourceHelp[state.source]}</p>
      
      {/* Source picker */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {DATA_SOURCES.map((ds) => (
          <button
            key={ds.value}
            type="button"
            onClick={() => dispatch({ type: "SET_SOURCE", source: ds.value })}
            className={`text-left border rounded-lg px-3 py-2.5 cursor-pointer transition-all ${
              state.source === ds.value
                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{ds.emoji}</span>
              <div>
                <p className="text-sm font-medium">{ds.label}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
      
      {/* Source-specific form */}
      <div className="flex flex-col gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
        {/* OpenMetadata */}
        {state.source === "openmetadata" && (
          <>
            <label className="text-sm text-[var(--text-muted)]">OpenMetadata Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_OM_MODE", omMode: "sandbox" })}
                className={`text-left border rounded-lg px-3 py-2 text-xs cursor-pointer ${
                  state.omMode === "sandbox" ? "border-[var(--accent)] bg-[var(--bg)]" : "border-[var(--border)]"
                }`}
              >
                <p className="font-medium text-[var(--text)]">Use Sandbox</p>
                <p className="text-[var(--text-muted)]">Fastest way to try DataBard with sample metadata.</p>
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_OM_MODE", omMode: "custom" })}
                className={`text-left border rounded-lg px-3 py-2 text-xs cursor-pointer ${
                  state.omMode === "custom" ? "border-[var(--accent)] bg-[var(--bg)]" : "border-[var(--border)]"
                }`}
              >
                <p className="font-medium text-[var(--text)]">Connect Your Instance</p>
                <p className="text-[var(--text-muted)]">Use your own OpenMetadata URL and bot token.</p>
              </button>
            </div>

            {state.omMode === "sandbox" ? (
              <>
                <label className="text-sm text-[var(--text-muted)]">Sandbox Endpoint</label>
                <input
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-muted)]"
                  value={DEFAULT_OM_SANDBOX_URL}
                  readOnly
                />
                <label className="text-sm text-[var(--text-muted)]">Sandbox Token (optional)</label>
                <input
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm"
                  type="password"
                  autoComplete="off"
                  value={state.token}
                  onChange={(e) => dispatch({ type: "SET_TOKEN", token: e.target.value })}
                  placeholder="Paste your OpenMetadata PAT/JWT if sandbox is not preconfigured"
                />
                <p className="text-xs text-[var(--text-muted)] -mt-2">Leave blank if admin configured shared sandbox credentials.</p>
              </>
            ) : (
              <>
                <label className="text-sm text-[var(--text-muted)]">OpenMetadata URL</label>
                <input 
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" 
                  value={state.omUrl} 
                  onChange={(e) => dispatch({ type: "SET_OM_URL", url: e.target.value })} 
                  placeholder="http://localhost:8585" 
                />
                <label className="text-sm text-[var(--text-muted)]">Auth Token</label>
                <input 
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" 
                  type="password" 
                  autoComplete="off" 
                  value={state.token} 
                  onChange={(e) => dispatch({ type: "SET_TOKEN", token: e.target.value })} 
                  placeholder="JWT from Settings → Bots" 
                />
              </>
            )}
          </>
        )}
        
        {/* dbt Cloud */}
        {state.source === "dbt-cloud" && (
          <>
            <label className="text-sm text-[var(--text-muted)]">Account ID</label>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" 
              value={state.dbtAccountId} 
              onChange={(e) => dispatch({ type: "SET_DBT_ACCOUNT_ID", id: e.target.value })} 
              placeholder="From URL: cloud.getdbt.com/deploy/{id}" 
            />
            <label className="text-sm text-[var(--text-muted)]">Project ID</label>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" 
              value={state.dbtProjectId} 
              onChange={(e) => dispatch({ type: "SET_DBT_PROJECT_ID", id: e.target.value })} 
              placeholder="From URL: …/projects/{id}" 
            />
            <label className="text-sm text-[var(--text-muted)]">API Token</label>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" 
              type="password" 
              autoComplete="off" 
              value={state.dbtToken} 
              onChange={(e) => dispatch({ type: "SET_DBT_TOKEN", token: e.target.value })} 
              placeholder="Account Settings → API Access" 
            />
          </>
        )}
        
        {/* dbt Local */}
        {state.source === "dbt-local" && (
          <>
            <label className="text-sm text-[var(--text-muted)]">Upload manifest.json</label>
            <div className="relative">
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => dispatch({ type: "SET_MANIFEST_FILE", file: e.target.files?.[0] ?? null })}
                className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm w-full file:mr-3 file:rounded file:border-0 file:bg-[var(--accent)] file:text-white file:px-3 file:py-1 file:text-xs file:cursor-pointer"
              />
              {state.manifestFile && (
                <p className="text-xs text-[var(--success)] mt-1">✓ {state.manifestFile.name} ({(state.manifestFile.size / 1024).toFixed(0)} KB)</p>
              )}
            </div>
          </>
        )}
        
        {/* The Graph */}
        {state.source === "the-graph" && (
          <>
            <label className="text-sm text-[var(--text-muted)]">Subgraph Endpoint URL</label>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" 
              value={state.graphUrl} 
              onChange={(e) => dispatch({ type: "SET_GRAPH_URL", url: e.target.value })} 
              placeholder="https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3" 
            />
            <label className="text-sm text-[var(--text-muted)]">API Key (optional)</label>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" 
              type="password" 
              autoComplete="off" 
              value={state.graphApiKey} 
              onChange={(e) => dispatch({ type: "SET_GRAPH_API_KEY", key: e.target.value })} 
              placeholder="For The Graph Network endpoints" 
            />
          </>
        )}
        
        {/* Dune */}
        {state.source === "dune" && (
          <>
            {state.persona === "web3" && (
              <div className="bg-[var(--accent)]/5 border border-[var(--accent)]/10 rounded-lg px-4 py-3 text-xs text-[var(--text-muted)]">
                <p className="flex items-center gap-2 text-[var(--text)] font-medium mb-1">
                  <span>💡</span>
                  <span>Getting started with Dune</span>
                </p>
                <p className="leading-relaxed">
                  Create a free API key at <a href="https://dune.com/settings/api" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">dune.com/settings/api</a>. 
                  DataBard will analyze queries in your namespace and narrate the results.
                </p>
              </div>
            )}
            <label className="text-sm text-[var(--text-muted)]">Dune API Key</label>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" 
              type="password" 
              autoComplete="off" 
              value={state.duneApiKey} 
              onChange={(e) => dispatch({ type: "SET_DUNE_API_KEY", key: e.target.value })} 
              placeholder="Paste your Dune API key" 
            />
            
            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--text-muted)]">Analyze specific queries</label>
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Recommended</span>
            </div>
            <input 
              className={`bg-[var(--bg)] border rounded-lg px-4 py-2 text-sm transition-colors ${
                state.duneQueryUrl && !state.duneQueryUrl.split(",").every(s => s.trim().match(/queries\/(\d+)|^\d+$/))
                  ? "border-yellow-500/50 focus:border-yellow-500" 
                  : "border-[var(--border)] focus:border-[var(--accent)]"
              }`} 
              value={state.duneQueryUrl} 
              onChange={(e) => dispatch({ type: "SET_DUNE_QUERY_URL", url: e.target.value })} 
              placeholder="dune.com/queries/123, 456..." 
            />
            {state.duneQueryUrl && !state.duneQueryUrl.split(",").every(s => s.trim().match(/queries\/(\d+)|^\d+$/)) && (
              <p className="text-[10px] text-yellow-500 flex items-center gap-1">
                <span>⚠️</span>
                <span>Please provide valid Query URLs or IDs (comma-separated).</span>
              </p>
            )}
            {!state.duneQueryUrl && (
              <p className="text-[10px] text-[var(--text-muted)] opacity-60">Paste multiple query URLs (comma-separated) for a batch report</p>
            )}

            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--text-muted)]">Dune Username</label>
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Browse all</span>
            </div>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm" 
              value={state.duneNamespace} 
              onChange={(e) => dispatch({ type: "SET_DUNE_NAMESPACE", ns: e.target.value })} 
              placeholder="e.g. uniswap (defaults to your own)" 
            />
          </>
        )}
        
        {/* Coral */}
        {state.source === "coral" && (
          <>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-xs text-[var(--text-muted)]">
              <p className="flex items-center gap-2 text-[var(--text)] font-medium mb-1">
                <span>🔌</span>
                <span>Bring your own source</span>
              </p>
              <p className="leading-relaxed">
                Coral connects 50+ sources (Salesforce, Jira, Postgres, Notion, Stripe, and more) via SQL.
                You can also join multiple sources in a single query. Runs locally — your data never leaves your machine.
              </p>
              <p className="mt-2 leading-relaxed">
                Requires <code className="bg-[var(--bg)] px-1 py-0.5 rounded text-[10px]">brew install withcoral/tap/coral</code> then <code className="bg-[var(--bg)] px-1 py-0.5 rounded text-[10px]">coral source add [your source]</code>
              </p>
            </div>
            <label className="text-sm text-[var(--text-muted)]">Example queries</label>
            <div className="flex flex-col gap-2">
              {[
                { label: "GitHub + Slack", query: "SELECT * FROM github.issues JOIN slack.messages ON issues.id = messages.id" },
                { label: "Jira + Postgres", query: "SELECT * FROM jira.issues JOIN postgres.deployments ON issues.key = deployments.ticket_id" },
                { label: "Custom SQL", query: "" },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => dispatch({ type: "SET_CORAL_QUERY", query: preset.query })}
                  className={`text-left border rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors ${
                    state.coralQuery === preset.query && preset.query
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
                >
                  <span className="font-medium text-[var(--text)]">{preset.label}</span>
                  {preset.query && <p className="text-[var(--text-muted)] mt-0.5 font-mono text-[10px] truncate">{preset.query}</p>}
                </button>
              ))}
            </div>
            <label className="text-sm text-[var(--text-muted)]">SQL Query</label>
            <textarea
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm h-28 font-mono"
              value={state.coralQuery}
              onChange={(e) => dispatch({ type: "SET_CORAL_QUERY", query: e.target.value })}
              placeholder="SELECT * FROM github.issues JOIN slack.messages..."
            />
          </>
        )}

        {state.source !== "dbt-local" && (
          <p className="text-xs text-[var(--text-muted)] -mt-2 flex items-center gap-1 opacity-70">
            <span>🔒</span> Credentials are sent over HTTPS and never stored on disk
          </p>
        )}

        <div className="flex flex-col gap-2 mt-2">
          <button 
            onClick={handleConnect} 
            disabled={state.connecting} 
            className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all hover:scale-[1.01] shadow-md shadow-[var(--accent)]/10"
          >
            {state.connecting && <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {state.connecting ? "Connecting…" : "Connect & Continue →"}
          </button>
          <button 
            onClick={handleTestConnection} 
            disabled={state.connectionTested === "testing"} 
            className="w-full bg-transparent hover:bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {state.connectionTested === "testing" && <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--text-muted)]/30 border-t-[var(--text-muted)] rounded-full animate-spin" />}
            {state.connectionTested === "success" && <span className="text-[var(--success)]">✓</span>}
            {state.connectionTested === "error" && <span className="text-red-500">✗</span>}
            Test Connection
          </button>
        </div>
        <button 
          onClick={() => dispatch({ type: "SET_STEP", step: "landing" })} 
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer text-center mt-2"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
