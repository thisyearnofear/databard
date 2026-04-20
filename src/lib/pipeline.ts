/**
 * Shared pipeline helpers — single source of truth for config building
 * used by both streaming and non-streaming synthesis routes.
 */
import type { ConnectionConfig } from "./types";
import { getSessionConfig } from "./session";

/** Build a ConnectionConfig from request body, preferring server-side session */
export async function buildConfig(body: Record<string, unknown>): Promise<ConnectionConfig> {
  // Prefer session config (credentials stored server-side)
  const sessionConfig = await getSessionConfig();
  if (sessionConfig) return sessionConfig;

  // Fall back to request body (for API callers like /api/regenerate)
  const source = (body.source as string) || "openmetadata";
  return {
    source: source as ConnectionConfig["source"],
    openmetadata: body.url && body.token
      ? { url: body.url as string, token: body.token as string }
      : undefined,
    dbtCloud: body.dbtCloud as ConnectionConfig["dbtCloud"],
    dbtLocal: body.dbtLocal as ConnectionConfig["dbtLocal"],
  };
}
