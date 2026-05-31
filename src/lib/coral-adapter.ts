import { execFile } from "child_process";
import { promisify } from "util";
import type { SchemaMeta, TableMeta, ColumnMeta, ConnectionConfig } from "./types";
import { extractSources } from "./coral-graduation";

const execFileAsync = promisify(execFile);
const CORAL_BIN = process.env.CORAL_BIN || "coral";
const CORAL_TIMEOUT_MS = Number(process.env.CORAL_TIMEOUT_MS) || 60_000;
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
        ? Object.keys(results[0]).map((col) => {
            const meta = inferColumnMeta(col, results);
            // Add sample values as description so the script generator can narrate them
            const sampleVals = results.slice(0, 5).map((r) => r[col]).filter((v) => v != null);
            const uniqueVals = new Set(results.map((r) => r[col]));
            const nullCount = results.filter((r) => r[col] == null).length;
            const parts: string[] = [];
            if (sampleVals.length > 0) parts.push(`samples: ${sampleVals.map((v) => String(v).slice(0, 50)).join(", ")}`);
            if (uniqueVals.size <= 20) parts.push(`${uniqueVals.size} unique values`);
            if (nullCount > 0) parts.push(`${nullCount} nulls`);
            meta.description = parts.join("; ") || undefined;
            return meta;
          })
        : [];

    // Build a data-aware description for the script generator
    const sourceList = sources.join(", ");
    const colSummary = columns.length > 0
      ? `${columns.length} columns (${columns.map((c) => c.name).join(", ")})`
      : "no columns";
    const dataSummary = results.length > 0
      ? `${results.length} rows across ${sourceList || "Coral sources"}. ${colSummary}.`
      : `Query returned no results from ${sourceList || "Coral sources"}.`;

    const tables: TableMeta[] = [
      {
        fqn: "coral.result",
        name: sources.length > 1 ? `Cross-source: ${sourceList}` : `Coral: ${sourceList || "query"}`,
        description: dataSummary,
        columns,
        qualityTests: [],
        tags: [sourceTag, "no-etl"],
        rowCount: results.length,
      },
    ];

    return {
      fqn: "coral.unified",
      name: sources.length > 1 ? `Cross-source: ${sourceList}` : `Coral: ${sourceList || "unified"}`,
      description: `Data joined across ${sources.length} source${sources.length !== 1 ? "s" : ""} via Coral SQL. ${dataSummary}`,
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
