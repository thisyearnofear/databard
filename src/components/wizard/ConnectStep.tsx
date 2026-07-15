"use client";

import { useState } from "react";
import { useWizard } from "./wizard-context";
import { useGeneration } from "./useGeneration";
import { useToast } from "@/components/Toast";
import type { DataSource } from "@/lib/types";
import { validateCoralSql, getDataAwarePresets } from "./coral-helpers";
import { CoralForm } from "./sources/CoralForm";
import { CoralConfigureStep } from "./sources/CoralConfigureStep";
import { SourceFields } from "./sources/SourceFields";

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
  const { generatePodcast, generateAnthem } = useGeneration();
  const { toast } = useToast();
  const [showOtherSources, setShowOtherSources] = useState(false);

  function showError(message: string) {
    toast(message, "error");
    dispatch({ type: "SET_STATUS", status: `Error: ${message}` });
  }

  async function handleCoralRunQuery() {
    if (!validateCoralSql(state.coralQuery).valid) return;
    dispatch({ type: "SET_CONNECTING", connecting: true });
    dispatch({ type: "SET_STATUS", status: "Running query…" });
    try {
      const res = await fetch("/api/coral/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: state.coralQuery }),
      });
      const data = await res.json();
      if (data.ok) {
        dispatch({ type: "SET_CORAL_PREVIEW_DATA", data });
        dispatch({ type: "SET_CORAL_SUB_STEP", subStep: "configure" });
        // Auto-fill research question with data-aware preset if empty
        if (!state.researchQuestion) {
          const presets = getDataAwarePresets(state.coralQuery, data.columns, data.sources);
          if (presets.length > 0) {
            dispatch({ type: "SET_RESEARCH_QUESTION", question: presets[0] });
          }
        }
        dispatch({ type: "SET_STATUS", status: "" });
      } else {
        showError(data.error || "Query failed");
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Query failed");
    } finally {
      dispatch({ type: "SET_CONNECTING", connecting: false });
    }
  }

  async function handleCoralGenerate() {
    dispatch({ type: "SET_CONNECTING", connecting: true });
    dispatch({ type: "SET_STATUS", status: "Generating…" });
    if (!state.researchQuestion) {
      const preview = state.coralPreviewData;
      const presets = preview ? getDataAwarePresets(state.coralQuery, preview.columns, preview.sources) : [];
      dispatch({ type: "SET_RESEARCH_QUESTION", question: presets[0] ?? "Summarize the key findings" });
    }
    dispatch({ type: "SET_SELECTED_SCHEMA", schema: "coral.unified" });
    await new Promise((r) => setTimeout(r, 50));
    if (state.outputFormat === "anthem") {
      await generateAnthem("coral.unified");
    } else {
      await generatePodcast("coral.unified");
    }
    dispatch({ type: "SET_CONNECTING", connecting: false });
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
          : "Start with one source. Your first findings appear while DataBard prepares the briefing."}
      </p>

      {state.source !== "coral" && (
        <div className="mb-5 grid grid-cols-3 border-y border-[var(--border)] py-3 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          <span><b className="block text-[var(--accent)] text-xs mb-1">1</b>Connect</span>
          <span><b className="block text-[var(--text)] text-xs mb-1">2</b>Review findings</span>
          <span><b className="block text-[var(--text)] text-xs mb-1">3</b>Get briefing</span>
        </div>
      )}

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
          <p className="text-xs text-[var(--text-muted)] mt-1.5 opacity-70">
            We&apos;ll auto-detect the source — or pick one below
          </p>
        </div>
      )}

      {/* Source picker — persona-aware primary source */}
      <div className="flex flex-col gap-3 mb-5">
        {state.persona === "web3" ? (
          <>
            {/* Onchain: Coral is primary */}
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_SOURCE", source: "coral" })}
              className={`flex items-center gap-3 border rounded-xl px-4 py-3 text-left cursor-pointer transition ${
                state.source === "coral"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-sm"
                  : "border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              <span className="text-xl">🪸</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">Cross-source SQL</p>
                <p className="text-xs text-[var(--text-muted)]">Join Dune, GitHub, Slack, and 50+ sources in one query</p>
              </div>
              {state.source === "coral" && <span className="text-[var(--accent)] text-sm">✓</span>}
            </button>

            {state.source !== "coral" && (
              <>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Or connect a specific source</p>
                <div className="flex flex-wrap gap-1.5">
                  {MAIN_SOURCES.map((ds) => (
                    <button
                      key={ds.value}
                      type="button"
                      onClick={() => dispatch({ type: "SET_SOURCE", source: ds.value })}
                      className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                        state.source === ds.value
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)] font-medium"
                          : "border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-muted)]"
                      }`}
                    >
                      <span>{ds.emoji}</span>
                      <span>{ds.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {state.source === "coral" && (
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_SOURCE", source: "dune" })}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer self-start"
              >
                ← Use a specific source instead
              </button>
            )}
          </>
        ) : (
          <>
            {/* Enterprise: OpenMetadata sandbox is primary */}
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "SET_SOURCE", source: "openmetadata" });
              }}
              className={`flex items-center gap-3 border rounded-xl px-4 py-3 text-left cursor-pointer transition ${
                state.source === "openmetadata"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-sm"
                  : "border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              <span className="text-xl">🔍</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">OpenMetadata</p>
                <p className="text-xs text-[var(--text-muted)]">Deep metadata — lineage, PII, quality tests, ownership. Sandbox available.</p>
              </div>
              {state.source === "openmetadata" && <span className="text-[var(--accent)] text-sm">✓</span>}
            </button>

            {state.source === "openmetadata" && !showOtherSources && (
              <button
                type="button"
                onClick={() => setShowOtherSources(true)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer self-start"
              >
                Use another connection
              </button>
            )}
            {(showOtherSources || state.source !== "openmetadata") && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Choose another connection</p>
                <div className="flex flex-wrap gap-1.5">
                {DATA_SOURCES.filter((ds) => ds.value !== "openmetadata").map((ds) => (
                  <button
                    key={ds.value}
                    type="button"
                    onClick={() => dispatch({ type: "SET_SOURCE", source: ds.value })}
                    className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                      state.source === ds.value
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)] font-medium"
                        : "border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-muted)]"
                    }`}
                  >
                    <span>{ds.emoji}</span>
                    <span>{ds.label}</span>
                  </button>
                ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Source-specific form */}
      <div className="flex flex-col gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
        {/* Non-Coral source fields */}
        {state.source !== "coral" && <SourceFields />}

        {/* Coral — two-phase flow */}
        {state.source === "coral" && state.coralSubStep === "query" && (
          <>
            <CoralForm
              query={state.coralQuery}
              onQueryChange={(q) => dispatch({ type: "SET_CORAL_QUERY", query: q })}
            />
            <button
              onClick={handleCoralRunQuery}
              disabled={state.connecting || !validateCoralSql(state.coralQuery).valid}
              className="w-full bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-3 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition ease-out hover:scale-[1.01] shadow-md shadow-[var(--accent)]/10"
            >
              {state.connecting && <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--bg)]/30 border-t-[var(--bg)] rounded-full animate-spin" />}
              {state.connecting ? "Running query…" : "Run Query →"}
            </button>
          </>
        )}

        {state.source === "coral" && state.coralSubStep === "configure" && state.coralPreviewData && (
          <CoralConfigureStep
            preview={state.coralPreviewData}
            query={state.coralQuery}
            outputFormat={state.outputFormat}
            researchQuestion={state.researchQuestion}
            connecting={state.connecting}
            onFormatChange={(f) => dispatch({ type: "SET_OUTPUT_FORMAT", format: f })}
            onQuestionChange={(q) => dispatch({ type: "SET_RESEARCH_QUESTION", question: q })}
            onGenerate={handleCoralGenerate}
            onBack={() => dispatch({ type: "SET_CORAL_SUB_STEP", subStep: "query" })}
          />
        )}

        {/* Actions — only for non-Coral sources (Coral has its own buttons inline) */}
        {state.source !== "coral" && (
          <div className="flex flex-col gap-2 mt-1">
            <button
              onClick={handleConnect}
              disabled={state.connecting}
              className="w-full bg-[var(--accent)] hover:brightness-110 text-[var(--bg)] rounded-lg px-4 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition ease-out hover:scale-[1.01] shadow-md shadow-[var(--accent)]/10"
            >
              {state.connecting && <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--bg)]/30 border-t-[var(--bg)] rounded-full animate-spin" />}
              {state.connecting ? "Connecting…" : "Connect & Continue →"}
            </button>

            {/* Test Connection — only visible after an error */}
            {showTestButton && (
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
            )}
          </div>
        )}

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
