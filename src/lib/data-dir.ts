/**
 * Data directory — centralized persistence for mint stats, leads, Coral usage,
 * and any other JSON-ledger state. Uses DATABARD_DATA_DIR env var or falls
 * back to process.cwd() + "data" (dev mode).
 */
import path from "path";

export function getDataDir(): string {
  if (process.env.DATABARD_DATA_DIR) return process.env.DATABARD_DATA_DIR;
  return path.join(process.cwd(), "data");
}

export function getDataPath(filename: string): string {
  return path.join(getDataDir(), filename);
}
