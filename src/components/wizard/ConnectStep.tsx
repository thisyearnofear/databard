"use client";

import { useState } from "react";
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
  
  // Auto-detect source from pasted input
  function handleSmartPaste(value: string) {
    const trimmed = value.trim();
    if (/thegraph\.com\/subgraphs|api\.studio\.thegraph/i.test(trimmed)) {
      dispatch({ type: "SET_SOURCE", source: "the-graph" });
      dispatch({ type: "SET_GRAPH_URL", url: trimmed });
    } else if (/dune\.com\/queries\/\d+/i.test(trimmed)) {
      dispatch({ type: "SET_SOURCE", source: "dune" });
      dispatch({ type: "SET_DUNE_QUERY_URL", url: trimmed });
    } else if (/^https?:\/\/.*openmetadata/i.test(trimmed)) {
      dispatch({ type: "SET_SOURCE", source: "openmetadata" });
      dispatch({ type: "SET_OM_MODE", omMode: "custom" });
      dispatch({ type: "SET_OM_URL", url: trimmed });
    }
  }

  const MAIN_SOURCES: { value: DataSource; label: string; emoji: string; hint: string }[] = state.persona === "web3"
    ? [
        { value: "dune", label: "Dune", emoji: "🏜️", hint: "API key" },
        { value: "the-graph", label: "The Graph", emoji: "🔗", hint: "Subgraph URL" },
        { value: "openmetadata", label: "OpenMetadata", emoji: "🔍", hint: "Sandbox or custom" },
      ]
    : [
        { value: "openmetadata", label: "OpenMetadata", emoji: "🔍", hint: "Sandbox or custom" },
        { value: "dbt-cloud", label: "dbt Cloud", emoji: "☁️", hint: "Account + token" },
        { value: "dbt-local", label: "dbt Local", emoji: "💻", hint: "Upload manifest" },
      ];

  const showTestButton = state.connectionTested === "error" || state.status?.startsWith("✗") || state.status?.startsWith("Error");

  return (
    <div className="w-full max-w-md">
      <h2 className="text-xl font-semibold mb-1">
        {state.source === "coral" ? "Query your data" : "Connect your data"}
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-5">
        {state.source === "coral"
          ? "Write SQL to join any sources — DataBard will narrate the results."
          : "Paste a URL or API key and you're generating in 30 seconds."}
      </p>

      {/* Smart paste bar — auto-detects source */}
      {state.source !== "coral" && (
        <div className="mb-5">
          <input
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none transition-colors"
            placeholder={state.persona === "web3"
              ? "Paste a Dune query URL, Subgraph endpoint, or API key…"
              : "Paste an OpenMetadata URL, dbt token, or subgraph endpoint…"}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              setTimeout(() => handleSmartPaste(pasted), 0);
            }}
            onChange={(e) => handleSmartPaste(e.target.value)}
          />
          <p className="text-[10px] text-[var(--text-muted)] mt-1.5 opacity-70">
            We&apos;ll auto-detect the source — or pick one below
          </p>
        </div>
      )}

      {/* Tiered source picker */}
      {state.source !== "coral" && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {MAIN_SOURCES.map((ds) => (
            <button
              key={ds.value}
              type="button"
              onClick={() => dispatch({ type: "SET_SOURCE", source: ds.value })}
              className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs cursor-pointer transition-all ${
                state.source === ds.value
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)] font-medium"
                  : "border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-muted)]"
              }`}
            >
              <span>{ds.emoji}</span>
              <span>{ds.label}</span>
            </button>
          ))}
          {/* Coral as escape hatch */}
          <button
            type="button"
            onClick={() => dispatch({ type: "SET_SOURCE", source: "coral" })}
            className="inline-flex items-center gap-1.5 border border-dashed border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-muted)] rounded-full px-3 py-1.5 text-xs cursor-pointer transition-all"
          >
            <span>🪸</span>
            <span>Any source (SQL)</span>
          </button>
        </div>
      )}

      {/* Coral back button — when in Coral mode, show way to go back to main sources */}
      {state.source === "coral" && (
        <button
          type="button"
          onClick={() => dispatch({ type: "SET_SOURCE", source: state.persona === "web3" ? "dune" : "openmetadata" })}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer mb-4 flex items-center gap-1"
        >
          ← Back to preset sources
        </button>
      )}
      
      {/* Source-specific form */}
      <div className="flex flex-col gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
        {/* OpenMetadata */}
        {state.source === "openmetadata" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_OM_MODE", omMode: "sandbox" })}
                className={`text-left border rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors ${
                  state.omMode === "sandbox" ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] hover:border-[var(--accent)]"
                }`}
              >
                <p className="font-medium text-[var(--text)]">Sandbox</p>
                <p className="text-[var(--text-muted)]">Try with sample data</p>
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_OM_MODE", omMode: "custom" })}
                className={`text-left border rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors ${
                  state.omMode === "custom" ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] hover:border-[var(--accent)]"
                }`}
              >
                <p className="font-medium text-[var(--text)]">Your instance</p>
                <p className="text-[var(--text-muted)]">URL + bot token</p>
              </button>
            </div>
            {state.omMode === "custom" && (
              <>
                <input 
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none" 
                  value={state.omUrl} 
                  onChange={(e) => dispatch({ type: "SET_OM_URL", url: e.target.value })} 
                  placeholder="http://localhost:8585" 
                />
                <input 
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none" 
                  type="password" 
                  autoComplete="off" 
                  value={state.token} 
                  onChange={(e) => dispatch({ type: "SET_TOKEN", token: e.target.value })} 
                  placeholder="Auth token (JWT from Settings → Bots)" 
                />
              </>
            )}
            {state.omMode === "sandbox" && (
              <p className="text-xs text-[var(--text-muted)]">
                Connects to sample metadata — no credentials needed.
              </p>
            )}
          </>
        )}
        
        {/* dbt Cloud */}
        {state.source === "dbt-cloud" && (
          <>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none" 
              value={state.dbtAccountId} 
              onChange={(e) => dispatch({ type: "SET_DBT_ACCOUNT_ID", id: e.target.value })} 
              placeholder="Account ID (from cloud.getdbt.com/deploy/{id})" 
            />
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none" 
              value={state.dbtProjectId} 
              onChange={(e) => dispatch({ type: "SET_DBT_PROJECT_ID", id: e.target.value })} 
              placeholder="Project ID (from …/projects/{id})" 
            />
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none" 
              type="password" 
              autoComplete="off" 
              value={state.dbtToken} 
              onChange={(e) => dispatch({ type: "SET_DBT_TOKEN", token: e.target.value })} 
              placeholder="API token (Account Settings → API Access)" 
            />
          </>
        )}
        
        {/* dbt Local */}
        {state.source === "dbt-local" && (
          <>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => dispatch({ type: "SET_MANIFEST_FILE", file: e.target.files?.[0] ?? null })}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm w-full file:mr-3 file:rounded file:border-0 file:bg-[var(--accent)] file:text-white file:px-3 file:py-1 file:text-xs file:cursor-pointer"
            />
            {state.manifestFile && (
              <p className="text-xs text-[var(--success)]">✓ {state.manifestFile.name} ({(state.manifestFile.size / 1024).toFixed(0)} KB)</p>
            )}
            {!state.manifestFile && (
              <p className="text-xs text-[var(--text-muted)]">Upload your target/manifest.json from a dbt build</p>
            )}
          </>
        )}
        
        {/* The Graph */}
        {state.source === "the-graph" && (
          <>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none" 
              value={state.graphUrl} 
              onChange={(e) => dispatch({ type: "SET_GRAPH_URL", url: e.target.value })} 
              placeholder="Subgraph URL (e.g. api.thegraph.com/subgraphs/name/…)" 
            />
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none" 
              type="password" 
              autoComplete="off" 
              value={state.graphApiKey} 
              onChange={(e) => dispatch({ type: "SET_GRAPH_API_KEY", key: e.target.value })} 
              placeholder="API key (optional, for Network endpoints)" 
            />
          </>
        )}
        
        {/* Dune — simplified */}
        {state.source === "dune" && (
          <>
            <input 
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none" 
              type="password" 
              autoComplete="off" 
              value={state.duneApiKey} 
              onChange={(e) => dispatch({ type: "SET_DUNE_API_KEY", key: e.target.value })} 
              placeholder="Dune API key (from dune.com/settings/api)" 
            />
            <input 
              className={`bg-[var(--bg)] border rounded-lg px-4 py-2 text-sm focus:outline-none transition-colors ${
                state.duneQueryUrl && !state.duneQueryUrl.split(",").every(s => s.trim().match(/queries\/(\d+)|^\d+$/))
                  ? "border-yellow-500/50 focus:border-yellow-500" 
                  : "border-[var(--border)] focus:border-[var(--accent)]"
              }`} 
              value={state.duneQueryUrl} 
              onChange={(e) => dispatch({ type: "SET_DUNE_QUERY_URL", url: e.target.value })} 
              placeholder="Query URL or ID (e.g. dune.com/queries/123)" 
            />
            <p className="text-[10px] text-[var(--text-muted)] -mt-1">
              {state.duneQueryUrl
                ? (state.duneQueryUrl.split(",").every(s => s.trim().match(/queries\/(\d+)|^\d+$/))
                    ? "✓ Valid query ID" : "⚠️ Paste a valid Dune query URL or ID")
                : "Paste one or more query URLs — or leave blank to browse your namespace"}
            </p>
          </>
        )}
        
        {/* Coral */}
        {state.source === "coral" && (
          <CoralForm
            query={state.coralQuery}
            onQueryChange={(q) => dispatch({ type: "SET_CORAL_QUERY", query: q })}
          />
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 mt-1">
          <button 
            onClick={handleConnect} 
            disabled={state.connecting || (state.source === "coral" && !validateCoralSql(state.coralQuery).valid)} 
            className="w-full bg-[var(--accent)] hover:brightness-110 text-white rounded-lg px-4 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all hover:scale-[1.01] shadow-md shadow-[var(--accent)]/10"
          >
            {state.connecting && <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {state.connecting ? "Connecting…" : "Connect & Continue →"}
          </button>

          {/* Test Connection — only visible after an error */}
          {showTestButton && (
            <button 
              onClick={handleTestConnection} 
              disabled={state.connectionTested === "testing" || (state.source === "coral" && !validateCoralSql(state.coralQuery).valid)} 
              className="w-full bg-transparent hover:bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {state.connectionTested === "testing" && <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--text-muted)]/30 border-t-[var(--text-muted)] rounded-full animate-spin" />}
              {state.connectionTested === "success" && <span className="text-[var(--success)]">✓</span>}
              {state.connectionTested === "error" && <span className="text-red-500">✗</span>}
              Test Connection
            </button>
          )}
        </div>

        {state.status && (
          <p className={`text-xs text-center py-1.5 px-3 rounded-lg transition-colors ${
            state.status.startsWith("✓") || state.status.startsWith("Connected")
              ? "text-[var(--success)] bg-[var(--success)]/5"
              : state.status.startsWith("✗") || state.status.startsWith("Error")
                ? "text-red-400 bg-red-500/5"
                : "text-[var(--text-muted)]"
          }`}>
            {state.status}
          </p>
        )}

        <button 
          onClick={() => dispatch({ type: "SET_STEP", step: "landing" })} 
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer text-center mt-1"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

// ─── CoralForm ───────────────────────────────────────────────────────────────

interface CoralFormProps {
  query: string;
  onQueryChange: (q: string) => void;
}

const ENTERPRISE_PRESETS = [
  {
    label: "GitHub + Slack",
    description: "Correlate issues with team discussions",
    query: `SELECT g.title, g.state, s.text, s.ts
FROM github.pull_requests g
JOIN slack.messages s ON s.channel = '#incidents'
WHERE g.merged_at >= NOW() - INTERVAL '7 days'
ORDER BY g.merged_at DESC`,
  },
  {
    label: "Jira + Postgres",
    description: "Link tickets to deployment history",
    query: `SELECT j.key, j.summary, j.status, p.version, p.deployed_at
FROM jira.issues j
JOIN postgres.deployments p ON j.key = p.ticket_id
WHERE p.deployed_at >= NOW() - INTERVAL '30 days'`,
  },
  {
    label: "Stripe + Notion",
    description: "Match payments to customer notes",
    query: `SELECT s.amount, s.currency, s.status, n.body as notes
FROM stripe.charges s
JOIN notion.pages n ON n.title LIKE '%' || s.customer_email || '%'`,
  },
];

const WEB3_PRESETS = [
  {
    label: "Dune + GitHub",
    description: "Correlate on-chain activity with repo commits",
    query: `SELECT d.block_time, d.tx_hash, g.message, g.author
FROM dune.transactions d
JOIN github.commits g ON g.committed_at::date = d.block_time::date
WHERE d.block_time >= NOW() - INTERVAL '7 days'
ORDER BY d.block_time DESC`,
  },
  {
    label: "TheGraph + Slack",
    description: "Match protocol events with team alerts",
    query: `SELECT t.event, t.amount, t.timestamp, s.text
FROM thegraph.swap_events t
JOIN slack.messages s ON s.channel = '#protocol-alerts'
WHERE t.timestamp >= NOW() - INTERVAL '7 days'`,
  },
  {
    label: "GitHub + Slack",
    description: "Correlate PRs with incident discussions",
    query: `SELECT g.title, g.state, s.text, s.ts
FROM github.pull_requests g
JOIN slack.messages s ON s.channel = '#incidents'
WHERE g.merged_at >= NOW() - INTERVAL '7 days'
ORDER BY g.merged_at DESC`,
  },
];


function parseCoralError(error: string): { message: string; hint?: string; action?: string } {
  if (/ENOENT|not found|command not found|coral: not found/i.test(error)) {
    return {
      message: "Coral CLI not found",
      hint: "Install Coral to run cross-source queries locally.",
      action: "brew install withcoral/tap/coral",
    };
  }
  if (/ECONNREFUSED|ETIMEDOUT|fetch failed|Gateway error|network/i.test(error)) {
    return {
      message: "Coral gateway unreachable",
      hint: "Check that CORAL_GATEWAY_URL is correct and the gateway is running.",
    };
  }
  if (/timeout|timed out/i.test(error)) {
    return {
      message: "Query timed out",
      hint: "Try a simpler query or increase CORAL_TIMEOUT_MS.",
    };
  }
  if (/source.*not.*configured|unknown source/i.test(error)) {
    const sourceMatch = error.match(/source[:\s]+['"]?(\w+)['"]?/i);
    return {
      message: `Source "${sourceMatch?.[1] ?? "unknown"}" not configured`,
      hint: "Add the source to Coral before querying it.",
      action: `coral source add ${sourceMatch?.[1] ?? "<source>"}`,
    };
  }
  return { message: error };
}

function validateCoralSql(query: string): { valid: boolean; hint?: string } {
  const trimmed = query.trim();
  if (!trimmed) return { valid: false, hint: "Query is empty" };
  if (!/\bSELECT\b/i.test(trimmed)) return { valid: false, hint: "Query should start with SELECT" };
  if (!/\bFROM\b/i.test(trimmed)) return { valid: false, hint: "Query needs a FROM clause" };
  if (!/\w+\.\w+/i.test(trimmed)) return { valid: false, hint: "Use source.table syntax (e.g. github.issues)" };
  return { valid: true };
}

function extractSources(query: string): string[] {
  const sources = new Set<string>();
  const re = /(?:FROM|JOIN)\s+(\w+)\.\w+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    sources.add(m[1].toLowerCase());
  }
  return [...sources];
}

function CoralForm({ query, onQueryChange }: CoralFormProps) {
  const { state } = useWizard();
  const presets = state.persona === "web3" ? WEB3_PRESETS : ENTERPRISE_PRESETS;
  const [previewOpen, setPreviewOpen] = useState(false);
  const validation = validateCoralSql(query);
  const querySources = extractSources(query);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{
    columns: Array<{ name: string; dataType: string; nullCount: number; sampleValues: unknown[] }>;
    rows: Record<string, unknown>[];
    rowCount: number;
    sources: string[];
    message?: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function handlePreview() {
    if (!query.trim()) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreviewData(null);
    try {
      const res = await fetch("/api/coral/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.ok) {
        setPreviewData(data);
        setPreviewOpen(true);
      } else {
        setPreviewError(data.error || "Preview failed");
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  const detectedSources = previewData?.sources ?? [];

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3 bg-[var(--accent)]/5 border border-[var(--accent)]/10 rounded-xl px-4 py-3">
        <span className="text-lg mt-0.5">🪸</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text)]">Query Any Source</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
            Coral connects 50+ sources via SQL — GitHub, Slack, Jira, Postgres, Notion, Stripe, and more.
            Join across sources in a single query. Runs locally — your data never leaves your machine.
          </p>
        </div>
      </div>

      {/* Preset queries */}
      <div>
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium block mb-2">
          Start from a template
        </label>
        <div className="flex flex-col gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onQueryChange(preset.query);
                setPreviewData(null);
                setPreviewOpen(false);
              }}
              className={`text-left border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                query === preset.query
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--text)]">{preset.label}</span>
                <span className="text-[10px] text-[var(--text-muted)]">{preset.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* SQL editor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
            SQL Query
          </label>
          {querySources.length > 0 && (
            <div className="flex items-center gap-1.5">
              {querySources.map((s) => (
                <span key={s} className="text-[10px] bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full font-medium">{s}</span>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <pre
            className="absolute inset-0 w-full h-full overflow-hidden bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm font-mono whitespace-pre-wrap break-all leading-relaxed pointer-events-none"
            aria-hidden="true"
          >
            {(query || " ").split(/(\b(?:SELECT|FROM|JOIN|WHERE|ON|AND|OR|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|AS|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|INTERVAL|DESC|ASC|IN|NOT|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|CASE|WHEN|THEN|ELSE|END|NOW)\b)/gi).map((part, i) =>
              /^(?:SELECT|FROM|JOIN|WHERE|ON|AND|OR|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|AS|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|INTERVAL|DESC|ASC|IN|NOT|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|CASE|WHEN|THEN|ELSE|END|NOW)$/i.test(part)
                ? <span key={i} className="text-[var(--accent)] font-semibold">{part}</span>
                : <span key={i} className="text-[var(--text)]">{part}</span>
            )}
          </pre>
          <textarea
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setPreviewData(null);
              setPreviewOpen(false);
            }}
            placeholder="SELECT * FROM github.issues JOIN slack.messages ON..."
            spellCheck={false}
            className={`relative w-full bg-transparent border rounded-lg px-4 py-3 text-sm font-mono text-transparent caret-[var(--accent)] resize-y min-h-32 focus:outline-none transition-colors ${
              !validation.valid && query.trim()
                ? "border-yellow-500/50 focus:border-yellow-500"
                : "border-[var(--border)] focus:border-[var(--accent)]"
            }`}
            style={{ WebkitTextFillColor: "transparent" }}
          />
        </div>
        {!validation.valid && query.trim() && validation.hint && (
          <p className="text-[10px] text-yellow-500 flex items-center gap-1 mt-1.5">
            <span>⚠️</span>
            <span>{validation.hint}</span>
          </p>
        )}
      </div>

      {/* Source badges + preview */}
      {detectedSources.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Sources:</span>
          {detectedSources.map((s) => (
            <span
              key={s}
              className="text-[10px] bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full font-medium"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!query.trim() || previewing || !validation.valid}
          className="flex-1 bg-[var(--surface)] hover:bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {previewing && <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--text-muted)]/30 border-t-[var(--text-muted)] rounded-full animate-spin" />}
          {previewing ? "Previewing…" : "Preview Results"}
        </button>
      </div>

      {/* Preview panel */}
      {previewing && !previewData && (
        <div className="border border-[var(--border)] rounded-xl overflow-hidden animate-pulse">
          <div className="bg-[var(--surface)] px-4 py-2 border-b border-[var(--border)] flex items-center gap-2">
            <div className="h-3 w-16 bg-[var(--border)] rounded" />
            <div className="h-3 w-24 bg-[var(--border)] rounded" />
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className="flex gap-1.5">
              <div className="h-5 w-20 bg-[var(--border)] rounded" />
              <div className="h-5 w-16 bg-[var(--border)] rounded" />
              <div className="h-5 w-24 bg-[var(--border)] rounded" />
            </div>
            <div className="h-4 w-full bg-[var(--border)] rounded" />
            <div className="h-4 w-3/4 bg-[var(--border)] rounded" />
            <div className="h-4 w-5/6 bg-[var(--border)] rounded" />
          </div>
        </div>
      )}

      {previewError && (() => {
        const parsed = parseCoralError(previewError);
        return (
          <div className="bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-3 text-xs">
            <p className="text-red-400 font-medium">{parsed.message}</p>
            {parsed.hint && <p className="text-red-400/70 mt-1">{parsed.hint}</p>}
            {parsed.action && (
              <code className="block mt-1.5 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-[10px] text-[var(--text-muted)] select-all">
                {parsed.action}
              </code>
            )}
          </div>
        );
      })()}

      {previewOpen && previewData && (
        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between bg-[var(--surface)] px-4 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text)]">Results</span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {previewData.rowCount} row{previewData.rowCount !== 1 ? "s" : ""} · {previewData.columns.length} columns
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Column list */}
          <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
            {previewData.columns.map((col) => (
              <span
                key={col.name}
                className="text-[11px] px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)]"
              >
                <span className="font-medium text-[var(--text)]">{col.name}</span>
                <span className="text-[var(--text-muted)] ml-1">{col.dataType}</span>
                {col.nullCount > 0 && (
                  <span className="text-[var(--text-muted)] ml-1 opacity-60">({col.nullCount} null)</span>
                )}
              </span>
            ))}
          </div>

          {/* Sample rows */}
          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {previewData.columns.map((col) => (
                    <th key={col.name} className="text-left px-3 py-2 font-medium text-[var(--text-muted)] whitespace-nowrap">
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]">
                    {previewData.columns.map((col) => {
                      const val = row[col.name];
                      const display = val === null ? "null" : typeof val === "object" ? JSON.stringify(val) : String(val);
                      return (
                        <td key={col.name} className="px-3 py-2 text-[var(--text-muted)] max-w-48 truncate" title={display}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewData.message && (
            <div className="px-4 py-2 text-xs text-[var(--text-muted)] italic bg-[var(--bg)]">
              {previewData.message}
            </div>
          )}
        </div>
      )}
    </>
  );
}
