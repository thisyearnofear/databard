"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { Episode, DataSource } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type WizardStep = "landing" | "connect" | "pick-schema" | "generating" | "episode";

export type OMMode = "sandbox" | "custom";

export interface WizardState {
  // Core flow
  step: WizardStep;
  persona: "enterprise" | "web3";
  
  // Connection
  source: DataSource;
  omMode: OMMode;
  omUrl: string;
  token: string;
  dbtAccountId: string;
  dbtProjectId: string;
  dbtToken: string;
  manifestFile: File | null;
  graphUrl: string;
  graphApiKey: string;
  duneApiKey: string;
  duneNamespace: string;
  duneQueryUrl: string;
  coralQuery: string;
  
  // Schemas
  schemas: string[];
  selectedSchema: string | null;
  searchQuery: string;
  schemaPage: number;
  expandedGroups: Set<string>;
  
  // Generation
  researchQuestion: string;
  genStep: number;
  genSegments: number;
  genTotal: number;
  genStartedAt: number;
  genFindings: string[];
  status: string;
  
  // Episode
  episode: Episode | null;
  groveCid: string | null;
  audioUrl: string | null;
  segmentOffsets: number[];
  audioDuration: number;
  
  // Solana
  minting: boolean;
  solanaAddress: string | null;
  solanaSolDomain: string | null;
  
  // UI
  connecting: boolean;
  connectionTested: "idle" | "testing" | "success" | "error";
  showEmailGate: boolean;
  leadEmail: string;
  mintStats: { total: number; recent: Array<{ schemaName: string; healthScore: number; walletAddress: string; txSignature: string; network: string; createdAt: string }> } | null;
}

type WizardAction =
  | { type: "SET_STEP"; step: WizardStep }
  | { type: "SET_PERSONA"; persona: "enterprise" | "web3" }
  | { type: "SET_SOURCE"; source: DataSource }
  | { type: "SET_OM_MODE"; omMode: OMMode }
  | { type: "SET_OM_URL"; url: string }
  | { type: "SET_TOKEN"; token: string }
  | { type: "SET_DBT_ACCOUNT_ID"; id: string }
  | { type: "SET_DBT_PROJECT_ID"; id: string }
  | { type: "SET_DBT_TOKEN"; token: string }
  | { type: "SET_MANIFEST_FILE"; file: File | null }
  | { type: "SET_GRAPH_URL"; url: string }
  | { type: "SET_GRAPH_API_KEY"; key: string }
  | { type: "SET_DUNE_API_KEY"; key: string }
  | { type: "SET_DUNE_NAMESPACE"; ns: string }
  | { type: "SET_DUNE_QUERY_URL"; url: string }
  | { type: "SET_CORAL_QUERY"; query: string }
  | { type: "SET_SCHEMAS"; schemas: string[] }
  | { type: "SET_SELECTED_SCHEMA"; schema: string | null }
  | { type: "SET_SEARCH_QUERY"; query: string }
  | { type: "SET_SCHEMA_PAGE"; page: number }
  | { type: "TOGGLE_GROUP"; group: string }
  | { type: "SET_RESEARCH_QUESTION"; question: string }
  | { type: "SET_GEN_STEP"; step: number }
  | { type: "SET_GEN_SEGMENTS"; count: number }
  | { type: "SET_GEN_TOTAL"; total: number }
  | { type: "SET_GEN_STARTED_AT"; time: number }
  | { type: "ADD_GEN_FINDING"; finding: string }
  | { type: "SET_GEN_FINDINGS"; findings: string[] }
  | { type: "SET_STATUS"; status: string }
  | { type: "SET_EPISODE"; episode: Episode | null }
  | { type: "SET_GROVE_CID"; cid: string | null }
  | { type: "SET_AUDIO_URL"; url: string | null }
  | { type: "SET_SEGMENT_OFFSETS"; offsets: number[] }
  | { type: "SET_AUDIO_DURATION"; duration: number }
  | { type: "SET_MINTING"; minting: boolean }
  | { type: "SET_SOLANA_ADDRESS"; address: string | null }
  | { type: "SET_SOLANA_SOL_DOMAIN"; domain: string | null }
  | { type: "SET_CONNECTING"; connecting: boolean }
  | { type: "SET_CONNECTION_TESTED"; tested: "idle" | "testing" | "success" | "error" }
  | { type: "SET_SHOW_EMAIL_GATE"; show: boolean }
  | { type: "SET_LEAD_EMAIL"; email: string }
  | { type: "SET_MINT_STATS"; stats: { total: number; recent: Array<{ schemaName: string; healthScore: number; walletAddress: string; txSignature: string; network: string; createdAt: string }> } | null }
  | { type: "RESET_GEN" }
  | { type: "RESET" };

const DEFAULT_OM_SANDBOX_URL = process.env.NEXT_PUBLIC_OM_SANDBOX_URL || "https://sandbox.open-metadata.org";

const initialState: WizardState = {
  step: "landing",
  persona: "web3",
  source: "openmetadata",
  omMode: "sandbox",
  omUrl: "http://localhost:8585",
  token: "",
  dbtAccountId: "",
  dbtProjectId: "",
  dbtToken: "",
  manifestFile: null,
  graphUrl: "",
  graphApiKey: "",
  duneApiKey: "",
  duneNamespace: "",
  duneQueryUrl: "",
  coralQuery: `SELECT g.title, g.state, s.text, s.ts
FROM github.pull_requests g
JOIN slack.messages s ON s.channel = '#incidents'
WHERE g.merged_at >= NOW() - INTERVAL '7 days'
ORDER BY g.merged_at DESC`,
  schemas: [],
  selectedSchema: null,
  searchQuery: "",
  schemaPage: 0,
  expandedGroups: new Set(),
  researchQuestion: "",
  genStep: -1,
  genSegments: 0,
  genTotal: 0,
  genStartedAt: 0,
  genFindings: [],
  status: "",
  episode: null,
  groveCid: null,
  audioUrl: null,
  segmentOffsets: [],
  audioDuration: 0,
  minting: false,
  solanaAddress: null,
  solanaSolDomain: null,
  connecting: false,
  connectionTested: "idle",
  showEmailGate: false,
  leadEmail: "",
  mintStats: null,
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP": return { ...state, step: action.step };
    case "SET_PERSONA": return { ...state, persona: action.persona };
    case "SET_SOURCE": return { ...state, source: action.source, connectionTested: "idle" };
    case "SET_OM_MODE": return { ...state, omMode: action.omMode, connectionTested: "idle" };
    case "SET_OM_URL": return { ...state, omUrl: action.url, connectionTested: "idle" };
    case "SET_TOKEN": return { ...state, token: action.token, connectionTested: "idle" };
    case "SET_DBT_ACCOUNT_ID": return { ...state, dbtAccountId: action.id, connectionTested: "idle" };
    case "SET_DBT_PROJECT_ID": return { ...state, dbtProjectId: action.id, connectionTested: "idle" };
    case "SET_DBT_TOKEN": return { ...state, dbtToken: action.token, connectionTested: "idle" };
    case "SET_MANIFEST_FILE": return { ...state, manifestFile: action.file, connectionTested: "idle" };
    case "SET_GRAPH_URL": return { ...state, graphUrl: action.url, connectionTested: "idle" };
    case "SET_GRAPH_API_KEY": return { ...state, graphApiKey: action.key, connectionTested: "idle" };
    case "SET_DUNE_API_KEY": return { ...state, duneApiKey: action.key, connectionTested: "idle" };
    case "SET_DUNE_NAMESPACE": return { ...state, duneNamespace: action.ns };
    case "SET_DUNE_QUERY_URL": return { ...state, duneQueryUrl: action.url };
    case "SET_CORAL_QUERY": return { ...state, coralQuery: action.query };
    case "SET_SCHEMAS": {
      const newSchemas = action.schemas;
      return { ...state, schemas: newSchemas, selectedSchema: newSchemas[0] ?? null };
    }
    case "SET_SELECTED_SCHEMA": return { ...state, selectedSchema: action.schema };
    case "SET_SEARCH_QUERY": return { ...state, searchQuery: action.query, schemaPage: 0 };
    case "SET_SCHEMA_PAGE": return { ...state, schemaPage: action.page };
    case "TOGGLE_GROUP": {
      const next = new Set(state.expandedGroups);
      if (next.has(action.group)) next.delete(action.group); else next.add(action.group);
      return { ...state, expandedGroups: next };
    }
    case "SET_RESEARCH_QUESTION": return { ...state, researchQuestion: action.question };
    case "SET_GEN_STEP": return { ...state, genStep: action.step };
    case "SET_GEN_SEGMENTS": return { ...state, genSegments: action.count };
    case "SET_GEN_TOTAL": return { ...state, genTotal: action.total };
    case "SET_GEN_STARTED_AT": return { ...state, genStartedAt: action.time };
    case "ADD_GEN_FINDING": return { ...state, genFindings: [...state.genFindings, action.finding] };
    case "SET_GEN_FINDINGS": return { ...state, genFindings: action.findings };
    case "SET_STATUS": return { ...state, status: action.status };
    case "SET_EPISODE": return { ...state, episode: action.episode };
    case "SET_GROVE_CID": return { ...state, groveCid: action.cid };
    case "SET_AUDIO_URL": return { ...state, audioUrl: action.url };
    case "SET_SEGMENT_OFFSETS": return { ...state, segmentOffsets: action.offsets };
    case "SET_AUDIO_DURATION": return { ...state, audioDuration: action.duration };
    case "SET_MINTING": return { ...state, minting: action.minting };
    case "SET_SOLANA_ADDRESS": return { ...state, solanaAddress: action.address };
    case "SET_SOLANA_SOL_DOMAIN": return { ...state, solanaSolDomain: action.domain };
    case "SET_CONNECTING": return { ...state, connecting: action.connecting };
    case "SET_CONNECTION_TESTED": return { ...state, connectionTested: action.tested };
    case "SET_SHOW_EMAIL_GATE": return { ...state, showEmailGate: action.show };
    case "SET_LEAD_EMAIL": return { ...state, leadEmail: action.email };
    case "SET_MINT_STATS": return { ...state, mintStats: action.stats };
    case "RESET_GEN": return {
      ...state,
      genStep: -1,
      genSegments: 0,
      genTotal: 0,
      genStartedAt: 0,
      genFindings: [],
    };
    case "RESET": return {
      ...initialState,
      persona: state.persona, // Preserve persona preference
    };
    default: return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  
  // Convenience actions
  setStep: (step: WizardStep) => void;
  showConnect: () => void;
  connected: (schemas: string[]) => void;
  startGenerating: () => void;
  backToSchema: () => void;
  episodeReady: () => void;
  reset: () => void;
  
  // Helpers
  filteredSchemas: string[];
  recommendedSchema: string | null;
  questionPresets: string[];
  sourceLabel: Record<DataSource, string>;
  sourceHelp: Record<DataSource, string>;
  activeContext: string;
}

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
  
  // Auto-switch source when persona changes
  // web3 → Coral (cross-source SQL is the hero)
  // enterprise → OpenMetadata (deep metadata is the hero)
  useEffect(() => {
    if (state.persona === "web3" && state.source === "openmetadata") {
      dispatch({ type: "SET_SOURCE", source: "coral" });
    } else if (state.persona === "enterprise" && state.source === "coral") {
      dispatch({ type: "SET_SOURCE", source: "openmetadata" });
    }
  }, [state.persona, state.source]);
  
  // Load aggregate Solana mint stats for web3 persona
  const loadMintStats = useCallback(async () => {
    try {
      const res = await fetch("/api/onchain/mints/stats?limit=5");
      const data = await res.json();
      if (data.ok) {
        dispatch({ type: "SET_MINT_STATS", stats: { total: data.total ?? 0, recent: data.recent ?? [] } });
      }
    } catch { /* swallow — stats are decorative */ }
  }, []);
  
  useEffect(() => {
    if (state.persona === "web3") loadMintStats();
  }, [state.persona, loadMintStats]);
  
  // Restore connection config from localStorage
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
  }, []);
  
  // Persist connection config to localStorage (excluding sensitive tokens for security)
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
  
  // Pre-fill first question preset when entering schema picker with empty question
  const questionPresets = useMemo(() =>
    state.persona === "enterprise"
      ? ["What tables are most likely to break downstream?", "Where are the biggest coverage gaps?", "What changed since last week?"]
      : ["Which entities are behind on freshness?", "Where is the biggest indexer risk?", "What protocol issue should we fix first?"],
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

  useEffect(() => {
    if (state.step === "pick-schema" && !state.researchQuestion) {
      dispatch({ type: "SET_RESEARCH_QUESTION", question: questionPresets[0] });
    }
  }, [state.step, state.researchQuestion, state.persona, questionPresets]);

  // Auto-expand the group containing the recommended schema on first load
  useEffect(() => {
    if (state.step === "pick-schema" && recommendedSchema && state.expandedGroups.size === 0) {
      const parts = recommendedSchema.split(".");
      const prefix = parts.length > 1 ? parts.slice(0, -1).join(".") : "default";
      dispatch({ type: "TOGGLE_GROUP", group: prefix });
    }
  }, [state.step, recommendedSchema, state.expandedGroups.size]);
  
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
