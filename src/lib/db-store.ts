/**
 * PostgreSQL-backed store — same interface as the file-backed Store in store.ts.
 * Used when DATABASE_URL is set. Falls back gracefully on any error.
 */
import { getPool } from "./db";

/** Lazy pool reference — null means DB unavailable */
function pool() {
  return getPool();
}

export const dbStore = {
  async set<T>(key: string, data: T, ttlSeconds = 3600): Promise<void> {
    const p = pool();
    if (!p) return;
    try {
      await p.query(
        `INSERT INTO kv_cache (key, value, expires_at, created_at)
         VALUES ($1, $2, now() + make_interval(secs => $3), now())
         ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = now() + make_interval(secs => $3)`,
        [key, JSON.stringify(data), ttlSeconds]
      );
    } catch (e) {
      console.warn("[db-store] set failed:", (e as Error).message);
    }
  },

  async get<T>(key: string): Promise<T | null> {
    const p = pool();
    if (!p) return null;
    try {
      const { rows } = await p.query(
        `SELECT value FROM kv_cache WHERE key = $1 AND expires_at > now()`,
        [key]
      );
      if (rows.length === 0) return null;
      return (rows[0] as { value: T }).value;
    } catch {
      return null;
    }
  },

  async delete(key: string): Promise<void> {
    const p = pool();
    if (!p) return;
    try {
      await p.query(`DELETE FROM kv_cache WHERE key = $1`, [key]);
    } catch { /* ignore */ }
  },

  async keys(prefix: string): Promise<string[]> {
    const p = pool();
    if (!p) return [];
    try {
      const { rows } = await p.query(
        `SELECT key FROM kv_cache WHERE key LIKE $1 AND expires_at > now()`,
        [`${prefix}%`]
      );
      return (rows as { key: string }[]).map((r) => r.key);
    } catch {
      return [];
    }
  },

  async clear(): Promise<void> {
    const p = pool();
    if (!p) return;
    try {
      await p.query(`DELETE FROM kv_cache`);
    } catch { /* ignore */ }
  },
};
