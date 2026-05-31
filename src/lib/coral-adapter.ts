import { execFile } from "child_process";
import { promisify } from "util";
import type { SchemaMeta, TableMeta, ColumnMeta, ConnectionConfig } from "./types";
import { extractSources } from "./coral-graduation";

const execFileAsync = promisify(execFile);
const CORAL_BIN = process.env.CORAL_BIN || "coral";
const CORAL_TIMEOUT_MS = Number(process.env.CORAL_TIMEOUT_MS) || 30_000;
const CORAL_MAX_BUFFER = Number(process.env.CORAL_MAX_BUFFER) || 10 * 1024 * 1024; // 10 MB

/**
 * Run a Coral SQL query via gateway (preferred in production) or local CLI.
 * Uses execFile with an args array so the query is never passed through a shell.
 */
export async function runCoralQuery(query: string): Promise<Record<string, unknown>[]> {
  const gatewayUrl = process.env.CORAL_GATEWAY_URL;
  if (gatewayUrl) {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Coral-Auth": process.env.CORAL_GATEWAY_TOKEN || "",
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`Coral Gateway error: ${res.statusText}`);
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  }

  const { stdout } = await execFileAsync(
    CORAL_BIN,
    ["sql", "--format", "json", query],
    { timeout: CORAL_TIMEOUT_MS, maxBuffer: CORAL_MAX_BUFFER }
  );
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [];
}

function inferColumnMeta(
  col: string,
  results: Record<string, unknown>[]
): ColumnMeta {
  const values = results.map((r) => r[col]).filter((v) => v != null);
  const types = new Set(values.map((v) => typeof v));
  let dataType = "string";
  if (types.size === 1) {
    if (types.has("number")) dataType = "number";
    else if (types.has("boolean")) dataType = "boolean";
  } else if (types.size === 2 && types.has("number") && types.has("string")) {
    dataType = "number";
  }
  return { name: col, dataType, tags: [] };
}

export async function fetchCoralMeta(config: ConnectionConfig): Promise<SchemaMeta> {
  if (!config.coral) {
    throw new Error("Coral configuration missing");
  }

  const { query } = config.coral;

  // Record anonymised usage for the graduation pipeline — fire-and-forget
  import("./coral-graduation").then((mod) => mod.trackCoralUsage(query)).catch(() => {});

  try {
    const results = await runCoralQuery(query);

    const sources = extractSources(query);
    const sourceTag = sources.length > 0 ? sources.join("+") : "coral";

    const columns: ColumnMeta[] =
      results.length > 0
        ? Object.keys(results[0]).map((col) => inferColumnMeta(col, results))
        : [];

    const tables: TableMeta[] = [
      {
        fqn: "coral.result",
        name: "Coral Query Result",
        description: `Cross-source query across: ${sources.join(", ") || "unknown sources"}`,
        columns,
        qualityTests: [],
        tags: [sourceTag, "no-etl"],
      },
    ];

    return {
      fqn: "coral",
      name: "Coral Unified Schema",
      description: `Data joined across ${sources.length} source${sources.length !== 1 ? "s" : ""} via Coral SQL`,
      tables,
      lineage: [],
    };
  } catch (error) {
    console.error("Coral fetch error:", error);
    throw new Error(
      `Failed to fetch data from Coral: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
