"use client";

import { useEffect, useCallback } from "react";
import type { WizardState, WizardAction } from "./wizard-types";
import { setDataContext } from "@/lib/data-context";

/**
 * Connection-persistence effects.
 * Restores and persists connection config (source, mode, URL, tokens) to localStorage.
 * Excludes sensitive tokens from persistence for security.
 */
export function useConnectionPersistence(
  state: WizardState,
  dispatch: React.Dispatch<WizardAction>,
) {
  // Restore connection config from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("databard:connection");
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.source) dispatch({ type: "SET_SOURCE", source: cfg.source });
        if (cfg.omMode === "sandbox" || cfg.omMode === "custom") dispatch({ type: "SET_OM_MODE", omMode: cfg.omMode });
        if (cfg.researchQuestion) dispatch({ type: "SET_RESEARCH_QUESTION", question: cfg.researchQuestion });
        if (cfg.omUrl) dispatch({ type: "SET_OM_URL", url: cfg.omUrl });
        if (cfg.token) dispatch({ type: "SET_TOKEN", token: cfg.token });
        if (cfg.dbtAccountId) dispatch({ type: "SET_DBT_ACCOUNT_ID", id: cfg.dbtAccountId });
        if (cfg.dbtProjectId) dispatch({ type: "SET_DBT_PROJECT_ID", id: cfg.dbtProjectId });
        if (cfg.dbtToken) dispatch({ type: "SET_DBT_TOKEN", token: cfg.dbtToken });
        if (cfg.coralQuery) dispatch({ type: "SET_CORAL_QUERY", query: cfg.coralQuery });
      }
    } catch { /* ignore corrupt localStorage */ }
  }, [dispatch]);

  // Persist connection config to localStorage (excluding sensitive tokens)
  useEffect(() => {
    try {
      localStorage.setItem("databard:connection", JSON.stringify({
        source: state.source,
        omMode: state.omMode,
        researchQuestion: state.researchQuestion,
        omUrl: state.omUrl,
        dbtAccountId: state.dbtAccountId,
        dbtProjectId: state.dbtProjectId,
        coralQuery: state.coralQuery,
      }));
    } catch { /* quota exceeded or private mode */ }
  }, [state.source, state.omMode, state.researchQuestion, state.omUrl, state.dbtAccountId, state.dbtProjectId, state.coralQuery]);
}

/**
 * Persona (workspace) effects.
 * Restores persona from URL param or localStorage, persists changes,
 * and keeps the URL workspace param in sync.
 */
export function usePersonaSync(
  state: WizardState,
  dispatch: React.Dispatch<WizardAction>,
  onReady: () => void,
) {
  // Restore persona from URL param or localStorage.
  // One-time v2 default: Protocols. Visitors who were silently defaulted to
  // Teams by the old initialState should land on the workspace the pilots use.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const param = params.get("workspace") ?? params.get("persona");
      const start = params.get("start");
      const applySource = (persona: "web3" | "enterprise") => {
        if (start === "connect") return;
        dispatch({ type: "SET_SOURCE", source: persona === "web3" ? "coral" : "dbt-local" });
      };
      if (param === "web3" || param === "onchain" || param === "protocols") {
        dispatch({ type: "SET_PERSONA", persona: "web3" });
        applySource("web3");
      } else if (param === "enterprise" || param === "teams") {
        dispatch({ type: "SET_PERSONA", persona: "enterprise" });
        applySource("enterprise");
      } else {
        const migrated = localStorage.getItem("databard:workspace-default");
        if (migrated) {
          const saved = localStorage.getItem("databard:persona");
          if (saved === "web3" || saved === "enterprise") {
            dispatch({ type: "SET_PERSONA", persona: saved });
            applySource(saved);
          }
        } else {
          localStorage.setItem("databard:workspace-default", "protocols");
          dispatch({ type: "SET_PERSONA", persona: "web3" });
          applySource("web3");
        }
      }
    } catch { /* ignore — SSR-safe by construction, storage may be unavailable */ }
    finally { onReady(); }
  }, [dispatch, onReady]);

  // Persist persona
  useEffect(() => {
    try {
      localStorage.setItem("databard:persona", state.persona);
    } catch { /* quota exceeded or private mode */ }
  }, [state.persona]);

  // Keep URL workspace param in sync
  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/") return;
    const params = new URLSearchParams(window.location.search);
    const workspace = state.persona === "web3" ? "protocols" : "teams";
    if (params.get("workspace") === workspace) return;
    params.set("workspace", workspace);
    window.history.replaceState({}, "", `/?${params.toString()}`);
    window.dispatchEvent(new Event("databard:workspacechange"));
  }, [state.persona]);
}

/**
 * Solana mint stats loader — decorative stats for web3 persona.
 */
export function useMintStats(
  state: WizardState,
  dispatch: React.Dispatch<WizardAction>,
) {
  const loadMintStats = useCallback(async () => {
    try {
      const res = await fetch("/api/onchain/mints/stats?limit=5");
      const data = await res.json();
      if (data.ok) {
        dispatch({ type: "SET_MINT_STATS", stats: { total: data.total ?? 0, recent: data.recent ?? [] } });
      }
    } catch { /* swallow — stats are decorative */ }
  }, [dispatch]);

  useEffect(() => {
    if (state.persona === "web3") loadMintStats();
  }, [state.persona, loadMintStats]);
}

/**
 * Schema picker helpers — auto-fills research question and auto-expands
 * the recommended schema group on first entry.
 */
export function useSchemaDefaults(
  state: WizardState,
  dispatch: React.Dispatch<WizardAction>,
  questionPresets: string[],
  recommendedSchema: string | null,
) {
  useEffect(() => {
    if (state.step === "pick-schema" && !state.researchQuestion) {
      dispatch({ type: "SET_RESEARCH_QUESTION", question: questionPresets[0] });
    }
  }, [state.step, state.researchQuestion, questionPresets, dispatch]);

  useEffect(() => {
    if (state.step === "pick-schema" && recommendedSchema && state.expandedGroups.size === 0) {
      const parts = recommendedSchema.split(".");
      const prefix = parts.length > 1 ? parts.slice(0, -1).join(".") : "default";
      dispatch({ type: "TOGGLE_GROUP", group: prefix });
    }
  }, [state.step, recommendedSchema, state.expandedGroups.size, dispatch]);
}

/** Minimal router surface used by useDeepLink (we only call push). */
type RouterLike = { push: (href: string) => void };

/**
 * Deep-link handler:
 *  - ?start=connect      -> jump to the connect step (Coral on Protocols, dbt manifest on Teams)
 *  - ?start=connect&mode=sample -> OpenMetadata sample catalog
 *  - ?start=connect&mode=my     -> workspace default (Coral / dbt manifest)
 *  - ?start=demo         -> seed demo data; Protocols land on this week's league
 */
export function useDeepLink(dispatch: React.Dispatch<WizardAction>, router: RouterLike) {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const start = params.get("start");
      if (start === "demo") {
        const workspace = params.get("workspace") === "teams" ? "teams" : "protocols";
        (async () => {
          try {
            const res = await fetch("/api/demo/seed", { method: "POST" });
            const data = await res.json();
            if (res.ok && data.ok) {
              setDataContext({ kind: "demo", label: "Demo", detail: "sample briefing", source: "demo", demo: true });
              router.push(workspace === "teams" ? "/protocol?episode=demo-enterprise&demo=1&workspace=teams" : "/league?from=demo");
              return;
            }
          } catch {
            /* fall through to in-wizard demo below */
          }
          setDataContext({ kind: "demo", label: "Demo", source: "demo", demo: true });
          dispatch({ type: "SET_STEP", step: "episode" });
        })();
        return;
      }
      if (start === "connect") {
        const mode = params.get("mode");
        const workspace = params.get("workspace") ?? params.get("persona");
        const isProtocols = workspace === "protocols" || workspace === "web3" || workspace === "onchain";
        if (mode === "sample") {
          dispatch({ type: "SET_SOURCE", source: "openmetadata" });
          dispatch({ type: "SET_OM_MODE", omMode: "sandbox" });
        } else if (isProtocols) {
          dispatch({ type: "SET_SOURCE", source: "coral" });
        } else {
          dispatch({ type: "SET_SOURCE", source: "dbt-local" });
        }
        dispatch({ type: "SET_STEP", step: "connect" });
      }
    } catch {
      /* ignore — SSR-safe by construction */
    }
  }, [dispatch, router]);
}

/**
 * Publishes the current "whose data is this" context whenever the wizard's
 * connection state changes, so the global header chip stays accurate even
 * after the user navigates away from the wizard to the dashboard.
 */
export function usePublishDataContext(state: WizardState, sandboxUrl: string) {
  useEffect(() => {
    if (state.step === "landing") return; // leave whatever was set
    if (state.source === "openmetadata" && state.omMode === "sandbox") {
      setDataContext({
        kind: "sample",
        label: "Sample data",
        detail: sandboxUrl.replace(/^https?:\/\//, ""),
        source: "openmetadata",
      });
    } else {
      const detail =
        state.source === "openmetadata"
          ? state.omUrl || "not connected"
          : state.source === "datahub"
            ? state.dhServerUrl || "not connected"
            : state.source === "dune"
              ? `Dune · ${state.duneNamespace || "user"}`
              : state.source;
      setDataContext({ kind: "connected", label: state.source, detail, source: state.source });
    }
  }, [state.step, state.source, state.omMode, state.omUrl, state.dhServerUrl, state.duneNamespace, sandboxUrl]);
}
