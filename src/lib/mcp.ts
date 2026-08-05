/**
 * Shared helpers for the /api/mcp/* A2MCP endpoints.
 *
 * The MCP tools are one-shot: each call carries the full connection spec +
 * schema FQN in the body and returns a synthesised result with no dependency
 * on persisted wizard/session state. This mirrors the normal-mode branch of
 * /api/synthesize, just factored out so the ASP surface is clean and stateless.
 */
import type { ConnectionConfig, DataSource } from "./types";
import { ValidationError, validateSchemaFqn, validateResearchQuestion } from "./validation";

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
  researchQuestion?: string;
  /** Briefing only: "podcast" (two-speaker, default) or "executive-summary". */
  outputFormat?: "podcast" | "executive-summary";
}

export interface ParsedMcpInput {
  config: ConnectionConfig;
  schemaFqn: string;
  researchQuestion?: string;
  outputFormat: "podcast" | "executive-summary";
}

/**
 * Parse + validate a one-shot MCP tool call body into a ConnectionConfig.
 * Throws ValidationError on bad input (caller maps to HTTP 400).
 */
export function parseMcpInput(body: unknown): ParsedMcpInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }
  const b = body as McpRequestInput;
  validateSchemaFqn(b.schemaFqn);

  const source = (b.source || "openmetadata") as DataSource;

  // OpenMetadata may arrive structured (b.openmetadata) or flat (b.url/b.token).
  const openmetadata =
    b.openmetadata ?? (b.url && b.token ? { url: b.url, token: b.token } : undefined);

  const config: ConnectionConfig = {
    source,
    openmetadata,
    datahub: b.datahub,
    dbtCloud: b.dbtCloud,
    dbtLocal: b.dbtLocal,
    theGraph: b.theGraph,
    dune: b.dune,
    coral: b.coral,
  };

  let researchQuestion: string | undefined;
  if (typeof b.researchQuestion === "string" && b.researchQuestion.trim()) {
    researchQuestion = b.researchQuestion.trim();
    validateResearchQuestion(researchQuestion);
  }

  const outputFormat: "podcast" | "executive-summary" =
    b.outputFormat === "executive-summary" ? "executive-summary" : "podcast";

  return { config, schemaFqn: b.schemaFqn, researchQuestion, outputFormat };
}
