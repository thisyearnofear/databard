"use client";

import { useWizard } from "../wizard-context";

const inputClass = "bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:border-[var(--accent)] focus:outline-none";

/** Renders source-specific form fields for non-Coral sources. */
export function SourceFields() {
  const { state, dispatch } = useWizard();

  return (
    <>
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
                className={inputClass}
                value={state.omUrl}
                onChange={(e) => dispatch({ type: "SET_OM_URL", url: e.target.value })}
                placeholder="http://localhost:8585"
              />
              <input
                className={inputClass}
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
            className={inputClass}
            value={state.dbtAccountId}
            onChange={(e) => dispatch({ type: "SET_DBT_ACCOUNT_ID", id: e.target.value })}
            placeholder="Account ID (from cloud.getdbt.com/deploy/{id})"
          />
          <input
            className={inputClass}
            value={state.dbtProjectId}
            onChange={(e) => dispatch({ type: "SET_DBT_PROJECT_ID", id: e.target.value })}
            placeholder="Project ID (from …/projects/{id})"
          />
          <input
            className={inputClass}
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
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm w-full file:mr-3 file:rounded file:border-0 file:bg-[var(--accent)] file:text-[var(--bg)] file:px-3 file:py-1 file:text-xs file:cursor-pointer"
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
            className={inputClass}
            value={state.graphUrl}
            onChange={(e) => dispatch({ type: "SET_GRAPH_URL", url: e.target.value })}
            placeholder="Subgraph URL (e.g. api.thegraph.com/subgraphs/name/…)"
          />
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            value={state.graphApiKey}
            onChange={(e) => dispatch({ type: "SET_GRAPH_API_KEY", key: e.target.value })}
            placeholder="API key (optional, for Network endpoints)"
          />
        </>
      )}

      {/* Dune */}
      {state.source === "dune" && (
        <>
          <input
            className={inputClass}
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
    </>
  );
}
