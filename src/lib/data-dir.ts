/**
 * Data directory — centralized persistence for mint stats, leads, Coral usage,
 * and any other JSON-ledger state.
 *
 * In production, DATABARD_DATA_DIR must be set (e.g. /opt/databard/data via
 * ecosystem.config.cjs). In development, falls back to ./data.
 *
 * The explicit production check prevents process.cwd() from leaking into the
 * server bundle — Next.js file tracing follows process.cwd() and would
 * otherwise trace the entire project directory (including contracts/target/,
 * video/, docs/, etc.) into the serverless function.
 */
import path from "path";

export function getDataDir(): string {
  if (process.env.DATABARD_DATA_DIR) return process.env.DATABARD_DATA_DIR;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABARD_DATA_DIR is required in production. Set it in your environment " +
        "(e.g. ecosystem.config.cjs or .env).",
    );
  }
  return path.join(process.cwd(), "data");
}

export function getDataPath(filename: string): string {
  return path.join(getDataDir(), filename);
}
