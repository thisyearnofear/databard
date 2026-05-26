import { exec } from "child_process";
import { promisify } from "util";
import type { SchemaMeta, TableMeta, ColumnMeta, QualityTest, ConnectionConfig } from "./types";

const execAsync = promisify(exec);

export async function fetchCoralMeta(config: ConnectionConfig): Promise<SchemaMeta> {
  if (!config.coral) {
    throw new Error("Coral configuration missing");
  }

  const { query } = config.coral;
  const gatewayUrl = process.env.CORAL_GATEWAY_URL;

  try {
    let results;

    if (gatewayUrl) {
      // Production path: Call a remote Coral Gateway (for Vercel/Serverless)
      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Coral-Auth": process.env.CORAL_GATEWAY_TOKEN || ""
        },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error(`Coral Gateway error: ${res.statusText}`);
      const data = await res.json();
      results = data.results;
    } else {
      // Local/Sidecar path: Execute via CLI
      const { stdout } = await execAsync(`coral sql --output json "${query.replace(/"/g, '\\"')}"`);
      results = JSON.parse(stdout);
    }

    // Map results to SchemaMeta
    // For the hackathon demo, we'll treat the query results as a virtual table.
    
    const tables: TableMeta[] = [
      {
        fqn: "coral.result",
        name: "Coral Query Result",
        description: `Virtual table generated from cross-source SQL join: ${query}`,
        columns: results.length > 0 ? Object.keys(results[0]).map(col => ({
          name: col,
          dataType: typeof results[0][col],
          tags: []
        })) : [],
        qualityTests: [],
        tags: ["coral", "no-etl"]
      }
    ];

    return {
      fqn: "coral",
      name: "Coral Unified Schema",
      description: "Data joined across disparate sources via Coral SQL query layer",
      tables,
      lineage: [] // Coral is the lineage sink here
    };
  } catch (error) {
    console.error("Coral fetch error:", error);
    throw new Error(`Failed to fetch data from Coral: ${error instanceof Error ? error.message : String(error)}`);
  }
}
