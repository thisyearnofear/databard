/**
 * PostgreSQL schema for DataBard.
 *
 * Mirrors the file-backed stores in store.ts and mint-stats.ts.
 * Run `migrate()` to create/update tables.
 */

export const SCHEMA_SQL = `
-- Sessions (replaces store.ts sessions namespace)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Shared episodes (replaces store.ts shares namespace)
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares (expires_at);

-- On-chain mint records (replaces mint-stats.ts JSON file)
CREATE TABLE IF NOT EXISTS mints (
  tx_signature TEXT PRIMARY KEY,
  schema_name TEXT NOT NULL,
  health_score INTEGER NOT NULL,
  episode_id TEXT NOT NULL,
  report_hash TEXT,
  wallet_address TEXT NOT NULL,
  network TEXT NOT NULL,
  grove_cid TEXT,
  grove_audio_url TEXT,
  team_id TEXT,
  alert_threshold INTEGER,
  alert_webhook TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mints_schema ON mints (schema_name);
CREATE INDEX IF NOT EXISTS idx_mints_wallet ON mints (wallet_address);
CREATE INDEX IF NOT EXISTS idx_mints_created ON mints (created_at DESC);

-- Alert subscriptions (replaces mint-stats.ts alerts JSON file)
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  wallet_address TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  webhook TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, schema_name)
);

-- Email leads (replaces leads/route.ts JSON file)
CREATE TABLE IF NOT EXISTS leads (
  email TEXT NOT NULL,
  source TEXT NOT NULL,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

-- Pro accounts (replaces store.ts proAccounts namespace)
CREATE TABLE IF NOT EXISTS pro_accounts (
  stripe_customer_id TEXT PRIMARY KEY,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'team',
  schedules JSONB NOT NULL DEFAULT '[]',
  feed_token TEXT NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Episode feed (replaces store.ts feedStore namespace)
CREATE TABLE IF NOT EXISTS episode_feed (
  id TEXT PRIMARY KEY,
  schema_name TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  table_count INTEGER NOT NULL,
  tests_failed INTEGER NOT NULL,
  tests_total INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feed_created ON episode_feed (created_at DESC);

-- Generic key-value cache (replaces store.ts audio/meta/script caches)
CREATE TABLE IF NOT EXISTS kv_cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv_cache (expires_at);
`;

/** Expire threshold for queries that filter by TTL */
export const EXPIRED_CONDITION = "expires_at > now()";
