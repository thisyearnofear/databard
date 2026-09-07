/**
 * Shared helpers for the /api/mcp/* A2MCP endpoints.
 *
 * The MCP tools are one-shot: each call carries the full connection spec +
 * schema FQN in the body and returns a synthesised result with no dependency
 * on persisted wizard/session state. This mirrors the normal-mode branch of
 * /api/synthesize, just factored out so the ASP surface is clean and stateless.
 */
import type { ConnectionConfig, DataSource } from "./types";
import { ValidationError } from "./validation";

export interface McpRequestInput {
  source?: DataSource;
  schemaFqn: string;
  /** Structured OpenMetadata connection (preferred). */
  openmetadata?: { url: string; token: string };
  /** DataHub Context Platform (GMS) connection. */
  datahub?: { serverUrl: string; token?: string };
  /** Flat OpenMetadata fields — accepted for parity with /api/synthesize. */
  url?: string;
  token?: string;
  dbtCloud?: { accountId: string; projectId: string; token: string };
  dbtLocal?: { manifestPath?: string; manifestContent?: string };
  theGraph?: { subgraphUrl: string; apiKey?: string };
  dune?: { apiKey: string; namespace?: string };
  coral?: { query: string; localFiles?: { path: string; name: string }[] };
  /** Monid metered endpoint — provider + endpoint discovered via `monid discover`/`inspect`. */
  monid?: ConnectionConfig["monid"];
  researchQuestion?: string;
  /** Briefing only: "podcast" (two-speaker, default) or "executive-summary". */
  outputFormat?: "podcast" | "executive-summary";
  /** Briefing only: how to deliver the narrated audio. Default "inline" (base64). */
  audio?: "inline" | "url" | "none";
}

export interface ParsedMcpInput {
  config: ConnectionConfig;
  schemaFqn: string;
  researchQuestion?: string;
  outputFormat: "podcast" | "executive-summary";
  /** True when schemaFqn was absent and a demo FQN was substituted (never an error). */
  defaultedFqn: boolean;
  /** True when a provided researchQuestion was dropped/truncated instead of 400ing. */
  adjustedResearchQuestion: boolean;
  /** Caller explicitly requested the demo analysis (`demo: true`). */
  forceDemo: boolean;
  /** Briefing audio delivery: "inline" (base64, default) | "url" | "none" (skip TTS). */
  audio: "inline" | "url" | "none";
}

/** The FQN the demo fallback fixture resolves to — used when the caller omits one. */
export const DEMO_FQN = "demo.uniswap";

/** Keys callers commonly use for the schema FQN (first string one wins). */
const FQN_ALIASES = [
  "schemaFqn",
  "schema_fqn",
  "schemaFQN",
  "fqn",
  "schema",
  "dataset",
  "schemaName",
  "tableName",
  "table",
] as const;

/** Wrapper keys agent frameworks often put the tool arguments under. */
const ENVELOPE_KEYS = ["arguments", "input", "params", "data", "payload", "tool_input", "toolInput"] as const;

const TOP_LEVEL_KEYS = new Set<string>([
  ...FQN_ALIASES,
  ...ENVELOPE_KEYS,
  "source",
  "openmetadata",
  "datahub",
  "url",
  "token",
  "dbtCloud",
  "dbt_cloud",
  "dbtLocal",
  "dbt_local",
  "theGraph",
  "the_graph",
  "dune",
  "coral",
  "monid",
  "researchQuestion",
  "research_question",
  "outputFormat",
  "output_format",
  "demo",
]);

/** Accept `dbt-cloud`, `dbt_cloud`, `DBT Cloud`, etc. */
const SOURCE_ALIASES: Record<string, DataSource> = {
  openmetadata: "openmetadata",
  "open-metadata": "openmetadata",
  open_metadata: "openmetadata",
  datahub: "datahub",
  "data-hub": "datahub",
  data_hub: "datahub",
  dbt: "dbt-cloud",
  "dbt-cloud": "dbt-cloud",
  dbt_cloud: "dbt-cloud",
  dbtcloud: "dbt-cloud",
  "dbt-local": "dbt-local",
  dbt_local: "dbt-local",
  dbtlocal: "dbt-local",
  "the-graph": "the-graph",
  the_graph: "the-graph",
  thegraph: "the-graph",
  dune: "dune",
  coral: "coral",
  monid: "monid",
};

function normalizeSource(raw: unknown): DataSource | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return SOURCE_ALIASES[key];
}

/** Accept an object-valued block; ignore primitives/arrays. */
function asBlock<T>(v: unknown): T | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : undefined;
}

/**
 * Parse a one-shot MCP tool call body into a ConnectionConfig.
 *
 * Deliberately lenient: marketplace reviewer agents (and any caller agent)
 * guess at parameter names. Instead of 400ing on missing/misnamed params we
 * unwrap common envelopes, accept FQN aliases, normalise source spellings,
 * drop/trim an out-of-range researchQuestion, and default a missing FQN to
 * the demo one. A caller with no reachable data source gets the clearly-
 * labelled demo analysis (see mcp-demo.ts) rather than an error.
 */
export function parseMcpInput(body: unknown): ParsedMcpInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Request body must be a JSON object");
  }

  // Unwrap agent-framework envelopes: {arguments: {...}}, {input: {...}}, etc.
  let record = body as Record<string, unknown>;
  const isEnvelopeKey = (k: string) => (ENVELOPE_KEYS as readonly string[]).includes(k);
  const hasKnownKey = Object.keys(record).some((k) => TOP_LEVEL_KEYS.has(k) && !isEnvelopeKey(k));
  if (!hasKnownKey) {
    for (const env of ENVELOPE_KEYS) {
      const inner = record[env];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        record = { ...(inner as Record<string, unknown>), ...record };
        break;
      }
    }
  }

  // Resolve the schema FQN from any alias; default (never throw) when absent.
  let schemaFqn: string | undefined;
  let defaultedFqn = false;
  for (const alias of FQN_ALIASES) {
    const v = record[alias];
    if (typeof v === "string" && v.trim()) {
      schemaFqn = v.trim();
      break;
    }
  }
  if (!schemaFqn) {
    schemaFqn = DEMO_FQN;
    defaultedFqn = true;
  }

  // Source: normalise the spelling; fall back to whichever connector block
  // the caller actually populated, then to OpenMetadata.
  let source = normalizeSource(record.source);
  if (!source) {
    if (record.datahub) source = "datahub";
    else if (record.dbtCloud ?? record.dbt_cloud) source = "dbt-cloud";
    else if (record.dbtLocal ?? record.dbt_local) source = "dbt-local";
    else if (record.theGraph ?? record.the_graph) source = "the-graph";
    else if (record.dune) source = "dune";
    else if (record.coral) source = "coral";
    else if (record.monid) source = "monid";
    else source = "openmetadata";
  }

  // OpenMetadata may arrive structured (record.openmetadata) or flat (url+token).
  const openmetadata =
    asBlock<McpRequestInput["openmetadata"]>(record.openmetadata) ??
    (typeof record.url === "string" && typeof record.token === "string"
      ? { url: record.url, token: record.token }
      : undefined);

  const config: ConnectionConfig = {
    source,
    openmetadata,
    datahub: asBlock(record.datahub),
    dbtCloud: asBlock(record.dbtCloud ?? record.dbt_cloud),
    dbtLocal: asBlock(record.dbtLocal ?? record.dbt_local),
    theGraph: asBlock(record.theGraph ?? record.the_graph),
    dune: asBlock(record.dune),
    coral: asBlock(record.coral),
    monid: asBlock(record.monid),
  };

  // researchQuestion: drop if too short, truncate if too long — never a 400.
  let researchQuestion: string | undefined;
  let adjustedResearchQuestion = false;
  const rqRaw = record.researchQuestion ?? record.research_question;
  if (typeof rqRaw === "string" && rqRaw.trim()) {
    researchQuestion = rqRaw.trim();
    if (researchQuestion.length < 8) {
      researchQuestion = undefined;
      adjustedResearchQuestion = true;
    } else if (researchQuestion.length > 240) {
      researchQuestion = researchQuestion.slice(0, 240);
      adjustedResearchQuestion = true;
    }
  }

  const formatRaw = (record.outputFormat ?? record.output_format) as string | undefined;
  const outputFormat: "podcast" | "executive-summary" =
    formatRaw === "executive-summary" || formatRaw === "executive_summary" || formatRaw === "executive summary"
      ? "executive-summary"
      : "podcast";

  const audioRaw = (record.audio ?? record.audioDelivery) as string | undefined;
  const audio: "inline" | "url" | "none" =
    audioRaw === "url" || audioRaw === "none" ? audioRaw : "inline";

  return {
    config,
    schemaFqn,
    researchQuestion,
    outputFormat,
    defaultedFqn,
    adjustedResearchQuestion,
    forceDemo: record.demo === true,
    audio,
  };
}
