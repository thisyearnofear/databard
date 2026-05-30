/**
 * Run schema migrations against PostgreSQL.
 * Safe to call on every startup -- uses IF NOT EXISTS.
 *
 * Usage:
 *   npx tsx src/lib/db/migrate.ts          # run migrations
 *   npx tsx src/lib/db/migrate.ts --drop   # drop all tables (dev only)
 */
import { getPool, query, closePool } from "./index";
import { SCHEMA_SQL } from "./schema";

export async function migrate(): Promise<void> {
  const pool = getPool();
  if (!pool) {
    console.log("[db] DATABASE_URL not set -- skipping migrations");
    return;
  }

  console.log("[db] Running migrations...");
  try {
    // Split on semicolons and execute each statement individually
    // to handle CREATE INDEX IF NOT EXISTS correctly
    const statements = SCHEMA_SQL.split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await query(stmt);
    }
    console.log(`[db] ${statements.length} statements executed successfully`);
  } catch (err) {
    console.error("[db] Migration failed:", err);
    throw err;
  } finally {
    await closePool();
  }
}

export async function dropAll(): Promise<void> {
  const pool = getPool();
  if (!pool) {
    console.log("[db] DATABASE_URL not set -- nothing to drop");
    return;
  }

  console.log("[db] Dropping all tables...");
  const tables = [
    "kv_cache",
    "episode_feed",
    "pro_accounts",
    "leads",
    "alert_subscriptions",
    "mints",
    "shares",
    "sessions",
  ];
  for (const table of tables) {
    await query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
  console.log("[db] All tables dropped");
  await closePool();
}

// CLI entry point
if (process.argv[1]?.endsWith("migrate.ts")) {
  const cmd = process.argv[2];
  if (cmd === "--drop") {
    dropAll().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  } else {
    migrate().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
}
