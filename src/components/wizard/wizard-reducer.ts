"use client";

import type { WizardState, WizardAction } from "./wizard-types";
import { initialState } from "./wizard-types";

/**
 * Reducer for connection-related actions.
 * Handles source selection, credentials, and connection test state.
 */
export function connectionReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_SOURCE":
      return { ...state, source: action.source, connectionTested: "idle", coralSubStep: "query", coralPreviewData: null };
    case "SET_OM_MODE":
      return { ...state, omMode: action.omMode, connectionTested: "idle" };
    case "SET_OM_URL":
      return { ...state, omUrl: action.url, connectionTested: "idle" };
    case "SET_TOKEN":
      return { ...state, token: action.token, connectionTested: "idle" };
    case "SET_DBT_ACCOUNT_ID":
      return { ...state, dbtAccountId: action.id, connectionTested: "idle" };
    case "SET_DBT_PROJECT_ID":
      return { ...state, dbtProjectId: action.id, connectionTested: "idle" };
    case "SET_DBT_TOKEN":
      return { ...state, dbtToken: action.token, connectionTested: "idle" };
    case "SET_MANIFEST_FILE":
      return { ...state, manifestFile: action.file, connectionTested: "idle" };
    case "SET_GRAPH_URL":
      return { ...state, graphUrl: action.url, connectionTested: "idle" };
    case "SET_GRAPH_API_KEY":
      return { ...state, graphApiKey: action.key, connectionTested: "idle" };
    case "SET_DUNE_API_KEY":
      return { ...state, duneApiKey: action.key, connectionTested: "idle" };
    case "SET_DUNE_NAMESPACE":
      return { ...state, duneNamespace: action.ns };
    case "SET_DUNE_QUERY_URL":
      return { ...state, duneQueryUrl: action.url };
    case "SET_CORAL_QUERY":
      return { ...state, coralQuery: action.query };
    case "SET_CORAL_SUB_STEP":
      return { ...state, coralSubStep: action.subStep };
    case "SET_CORAL_PREVIEW_DATA":
      return { ...state, coralPreviewData: action.data };
    case "SET_OUTPUT_FORMAT":
      return { ...state, outputFormat: action.format };
    case "SET_CONNECTING":
      return { ...state, connecting: action.connecting };
    case "SET_CONNECTION_TESTED":
      return { ...state, connectionTested: action.tested };
    default:
      return state;
  }
}

/**
 * Reducer for schema picker actions.
 */
export function schemaReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_SCHEMAS": {
      const newSchemas = action.schemas;
      return { ...state, schemas: newSchemas, selectedSchema: newSchemas[0] ?? null };
    }
    case "SET_SELECTED_SCHEMA":
      return { ...state, selectedSchema: action.schema };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.query, schemaPage: 0 };
    case "SET_SCHEMA_PAGE":
      return { ...state, schemaPage: action.page };
    case "TOGGLE_GROUP": {
      const next = new Set(state.expandedGroups);
      if (next.has(action.group)) next.delete(action.group); else next.add(action.group);
      return { ...state, expandedGroups: next };
    }
    default:
      return state;
  }
}

/**
 * Reducer for generation progress actions.
 */
export function generationReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_RESEARCH_QUESTION":
      return { ...state, researchQuestion: action.question };
    case "SET_GEN_STEP":
      return { ...state, genStep: action.step };
    case "SET_GEN_SEGMENTS":
      return { ...state, genSegments: action.count };
    case "SET_GEN_TOTAL":
      return { ...state, genTotal: action.total };
    case "SET_GEN_STARTED_AT":
      return { ...state, genStartedAt: action.time };
    case "ADD_GEN_FINDING":
      return { ...state, genFindings: [...state.genFindings, action.finding] };
    case "SET_GEN_FINDINGS":
      return { ...state, genFindings: action.findings };
    case "SET_LIVE_SIGNAL":
      return { ...state, liveSignal: action.signal };
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "RESET_GEN":
      return {
        ...state,
        genStep: -1,
        genSegments: 0,
        genTotal: 0,
        genStartedAt: 0,
        genFindings: [],
        liveSignal: null,
      };
    default:
      return state;
  }
}

/**
 * Reducer for episode + Solana actions.
 */
export function episodeReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_EPISODE":
      return { ...state, episode: action.episode };
    case "SET_GROVE_CID":
      return { ...state, groveCid: action.cid };
    case "SET_AUDIO_URL":
      return { ...state, audioUrl: action.url };
    case "SET_SEGMENT_OFFSETS":
      return { ...state, segmentOffsets: action.offsets };
    case "SET_AUDIO_DURATION":
      return { ...state, audioDuration: action.duration };
    case "SET_MINTING":
      return { ...state, minting: action.minting };
    // Bail out on unchanged values — wallet components re-fire these from effects,
    // and returning a new state object each time creates an infinite render loop
    // that starves React route transitions (navigation away from the episode step hangs).
    case "SET_SOLANA_ADDRESS":
      return state.solanaAddress === action.address ? state : { ...state, solanaAddress: action.address };
    case "SET_SOLANA_SOL_DOMAIN":
      return state.solanaSolDomain === action.domain ? state : { ...state, solanaSolDomain: action.domain };
    case "SET_MINT_STATS":
      return { ...state, mintStats: action.stats };
    default:
      return state;
  }
}

/**
 * Reducer for core flow + UI actions.
 */
export function coreReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_PERSONA":
      return { ...state, persona: action.persona };
    case "SET_SHOW_EMAIL_GATE":
      return { ...state, showEmailGate: action.show };
    case "SET_LEAD_EMAIL":
      return { ...state, leadEmail: action.email };
    case "RESET":
      return {
        ...initialState,
        persona: state.persona, // Preserve persona preference
      };
    default:
      return state;
  }
}

/**
 * Composed reducer — delegates each action to the domain reducer that owns it.
 * Domain reducers return the unchanged state for actions they don't handle,
 * so the order doesn't matter. Only one reducer will produce a new state per action.
 */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  // Try each domain reducer in sequence. The one that handles this action
  // will return a new state; the rest return the same state object.
  let next = coreReducer(state, action);
  if (next !== state) return next;
  next = connectionReducer(state, action);
  if (next !== state) return next;
  next = schemaReducer(state, action);
  if (next !== state) return next;
  next = generationReducer(state, action);
  if (next !== state) return next;
  next = episodeReducer(state, action);
  if (next !== state) return next;
  return state;
}


