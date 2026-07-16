"use client";

import { createContext, useContext, useState, useCallback, useMemo, useReducer, type ReactNode } from "react";
import type { DataSource } from "@/lib/types";

// Re-export types and initialState for backward compatibility
export type { WizardStep, OMMode, LiveBriefingSignal, WizardState, WizardAction, WizardContextValue } from "./wizard-types";
import type { WizardState, WizardAction, WizardContextValue, WizardStep } from "./wizard-types";
import { initialState, DEFAULT_OM_SANDBOX_URL } from "./wizard-types";
import { wizardReducer } from "./wizard-reducer";
import { useConnectionPersistence, usePersonaSync, useMintStats, useSchemaDefaults, useDeepLink } from "./wizard-effects";

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used within WizardProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

interface WizardProviderProps {
  children: ReactNode;
  sandboxUrl?: string;
}

export function WizardProvider({ children, sandboxUrl = DEFAULT_OM_SANDBOX_URL }: WizardProviderProps) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  const [personaReady, setPersonaReady] = useState(false);
  const onPersonaReady = useCallback(() => setPersonaReady(true), []);

  // Extracted effects (previously inline in this component)
  useDeepLink(dispatch);
  useConnectionPersistence(state, dispatch);
  usePersonaSync(state, dispatch, onPersonaReady);
  useMintStats(state, dispatch);

  // Question presets — persona-aware
  const questionPresets = useMemo(() =>
    state.persona === "enterprise"
      ? ["What tables are most likely to break downstream?", "Where are the biggest coverage gaps?", "What changed since last week?"]
      : ["What patterns should the hosts investigate?", "Which repos need the most attention?", "What should we prioritize next?"],
    [state.persona]
  );

  // Filtered schemas
  const filteredSchemas = useMemo(() =>
    state.schemas.filter((s) =>
      s.toLowerCase().includes(state.searchQuery.toLowerCase())
    ),
    [state.schemas, state.searchQuery]
  );

  // Smart schema recommendation: schemas with more dots (deeper hierarchy) tend to be richer
  const recommendedSchema = useMemo(() =>
    state.schemas.length > 1
      ? state.schemas.reduce((best, s) => (s.split(".").length > best.split(".").length || s.length > best.length ? s : best), state.schemas[0])
      : state.schemas[0] ?? null,
    [state.schemas]
  );

  // Schema picker defaults — auto-fill question, auto-expand recommended group
  useSchemaDefaults(state, dispatch, questionPresets, recommendedSchema);

  // Source labels
  const sourceLabel: Record<DataSource, string> = {
    openmetadata: "OpenMetadata",
    "dbt-cloud": "dbt Cloud",
    "dbt-local": "dbt Local",
    "the-graph": "The Graph",
    dune: "Dune",
    coral: "Coral",
  };

  // Source help text
  const sourceHelp: Record<DataSource, string> = {
    openmetadata: "Choose the OpenMetadata sandbox for a one-click demo, or connect your own instance.",
    "dbt-cloud": "Find Account ID and Project ID in your dbt Cloud URL. Generate a token at Account Settings → API Access.",
    "dbt-local": "Run `dbt compile` first, then point to the generated manifest.json in your target/ directory.",
    "the-graph": "Paste any subgraph endpoint URL. DataBard introspects the GraphQL schema and treats entities as tables.",
    dune: "Enter your Dune API key and your Dune username. DataBard runs your queries and analyzes the results to create data-rich episodes.",
    coral: "Query 50+ sources via SQL — GitHub, Slack, Jira, Postgres, Notion, Stripe, and more. Join across sources in a single query.",
  };

  // Active context string
  const activeContext =
    state.source === "openmetadata"
      ? state.omMode === "sandbox"
        ? `Sandbox · ${sandboxUrl}`
        : `Custom · ${state.omUrl || "Not set"}`
      : state.source === "dbt-cloud"
        ? `Account ${state.dbtAccountId || "?"} · Project ${state.dbtProjectId || "?"}`
        : state.source === "dbt-local"
          ? state.manifestFile?.name || "No manifest uploaded"
          : state.source === "the-graph"
            ? state.graphUrl || "No subgraph endpoint set"
            : state.source === "coral"
              ? "Cross-source SQL"
              : state.duneNamespace
                ? `Dune user: ${state.duneNamespace}`
                : "Dune username optional";

  // Convenience actions
  const setStep = useCallback((step: WizardStep) => dispatch({ type: "SET_STEP", step }), []);
  const showConnect = useCallback(() => dispatch({ type: "SET_STEP", step: "connect" }), []);
  const connected = useCallback((schemas: string[]) => {
    dispatch({ type: "SET_SCHEMAS", schemas });
    // Coral skips the schema picker — goes straight to question + generate
    if (state.source === "coral") {
      dispatch({ type: "SET_STEP", step: "pick-schema" });
    } else {
      dispatch({ type: "SET_STEP", step: schemas.length > 0 ? "pick-schema" : "connect" });
    }
  }, [state.source]);
  const startGenerating = useCallback(() => dispatch({ type: "SET_STEP", step: "generating" }), []);
  const backToSchema = useCallback(() => dispatch({ type: "SET_STEP", step: "pick-schema" }), []);
  const episodeReady = useCallback(() => dispatch({ type: "SET_STEP", step: "episode" }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const value: WizardContextValue = {
    state,
    dispatch,
    setStep,
    showConnect,
    connected,
    startGenerating,
    backToSchema,
    episodeReady,
    reset,
    filteredSchemas,
    recommendedSchema,
    questionPresets,
    sourceLabel,
    sourceHelp,
    activeContext,
  };

  return (
    <WizardContext.Provider value={value}>
      {children}
    </WizardContext.Provider>
  );
}
