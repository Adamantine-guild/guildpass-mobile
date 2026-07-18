// ---------------------------------------------------------------------------
// DDL statements for the entire relational schema.
//
// These are the canonical CREATE TABLE / CREATE INDEX statements that the
// migration runner applies in version order.  Each statement is idempotent
// (IF NOT EXISTS / OR IGNORE) so the runner can re-apply the base DDL safely.
// ---------------------------------------------------------------------------

/**
 * Core schema DDL statements in dependency order.
 * Version 1: initial schema.
 */
export const SCHEMA_VERSION_1 = `
-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version   INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Guilds: core guild metadata fetched from the API
CREATE TABLE IF NOT EXISTS guilds (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  icon_url    TEXT,
  chain_id    INTEGER NOT NULL,
  raw_json    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Guild configurations (feature flags, settings per guild)
CREATE TABLE IF NOT EXISTS guild_configs (
  id          TEXT PRIMARY KEY,
  guild_id    TEXT NOT NULL UNIQUE,
  config_json TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- Locally-tracked wallet addresses
CREATE TABLE IF NOT EXISTS wallets (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  address  TEXT NOT NULL UNIQUE,
  label    TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Roles defined within a guild
CREATE TABLE IF NOT EXISTS roles (
  id          TEXT NOT NULL,
  guild_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  permissions TEXT,
  raw_json    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (id, guild_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- Wallet membership in a guild
CREATE TABLE IF NOT EXISTS memberships (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  guild_id       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'unknown'
                 CHECK(status IN ('active','expired','revoked','unknown')),
  raw_json       TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(wallet_address, guild_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- Roles assigned to a wallet within a guild
CREATE TABLE IF NOT EXISTS user_roles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  guild_id       TEXT NOT NULL,
  role_id        TEXT NOT NULL,
  raw_json       TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(wallet_address, guild_id, role_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- Access-check history
CREATE TABLE IF NOT EXISTS access_checks (
  id                  TEXT PRIMARY KEY,
  wallet_address      TEXT NOT NULL,
  guild_id            TEXT NOT NULL,
  resource_id         TEXT NOT NULL,
  status              TEXT NOT NULL
                      CHECK(status IN ('granted','denied','error')),
  reason              TEXT,
  matched_roles_json  TEXT,
  required_roles_json TEXT,
  checked_at          TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_guilds_updated_at     ON guilds(updated_at);
CREATE INDEX IF NOT EXISTS idx_roles_guild_id        ON roles(guild_id);
CREATE INDEX IF NOT EXISTS idx_memberships_wallet    ON memberships(wallet_address);
CREATE INDEX IF NOT EXISTS idx_memberships_guild     ON memberships(guild_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_wallet     ON user_roles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_roles_guild      ON user_roles(guild_id);
CREATE INDEX IF NOT EXISTS idx_access_checks_wallet   ON access_checks(wallet_address);
CREATE INDEX IF NOT EXISTS idx_access_checks_guild    ON access_checks(guild_id);
CREATE INDEX IF NOT EXISTS idx_access_checks_checked  ON access_checks(checked_at);
`;

/**
 * Map of version → Migration.  Add new entries here when the schema evolves.
 *
 * IMPORTANT: Each version N migration must be safe to run on a database that is
 * already at version N (i.e. use IF NOT EXISTS / try-catch in the runner).
 */
export const MIGRATIONS: Record<number, { name: string; sql: string }> = {
  1: { name: "initial-schema", sql: SCHEMA_VERSION_1 },
  // Future migrations:
  // 2: { name: "add-foo-column", sql: "ALTER TABLE ..." },
};
