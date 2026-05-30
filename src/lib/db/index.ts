/**
 * PostgreSQL client singleton.
 *
 * Uses DATABASE_URL env var. Falls back gracefully when not configured
 * (all existing file-backed stores continue to work).
 */
import { Pool, type PoolClient } from "pg";

let pool: Pool | null = null;

/** Returns the connection pool, or null if DATABASE_URL is not set. */
export function getPool(): Pool | null {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on("error", (err) => {
    console.error("[db] Unexpected pool error:", err.message);
  });
  return pool;
}

/** Execute a query with automatic connection release. */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[] }> {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL not configured");
  return p.query(text, params) as Promise<{ rows: T[] }>;
}

/** Get a dedicated client for transactions. Remember to release(). */
export async function getClient(): Promise<PoolClient> {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL not configured");
  return p.connect();
}

/** Graceful shutdown. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
