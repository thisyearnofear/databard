"use client";

import type { Episode, DataSource } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type WizardStep = "landing" | "connect" | "pick-schema" | "generating" | "episode";

export type OMMode = "sandbox" | "custom";

export interface LiveBriefingSignal {
  healthScore: number;
  healthLabel: "healthy" | "at-risk" | "critical";
  primaryFinding: string;
  supportingFindings: string[];
}

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
  coralSubStep: "query" | "configure";
  coralPreviewData: {
    columns: Array<{ name: string; dataType: string; nullCount: number; sampleValues: unknown[] }>;
    rows: Record<string, unknown>[];
    rowCount: number;
    sources: string[];
    message?: string;
  } | null;
  outputFormat: "podcast" | "anthem" | "executive-summary";

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
  liveSignal: LiveBriefingSignal | null;
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

export type WizardAction =
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
  | { type: "SET_CORAL_SUB_STEP"; subStep: "query" | "configure" }
  | { type: "SET_CORAL_PREVIEW_DATA"; data: WizardState["coralPreviewData"] }
  | { type: "SET_OUTPUT_FORMAT"; format: "podcast" | "anthem" | "executive-summary" }
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
  | { type: "SET_LIVE_SIGNAL"; signal: LiveBriefingSignal | null }
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

// ─── Initial State ───────────────────────────────────────────────────────────

const DEFAULT_OM_SANDBOX_URL = process.env.NEXT_PUBLIC_OM_SANDBOX_URL || "https://sandbox.open-metadata.org";

export { DEFAULT_OM_SANDBOX_URL };

export const initialState: WizardState = {
  step: "landing",
  persona: "enterprise",
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
  coralSubStep: "query",
  coralPreviewData: null,
  outputFormat: "podcast",
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
  liveSignal: null,
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

// ─── Context Value Interface ─────────────────────────────────────────────────

export interface WizardContextValue {
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
