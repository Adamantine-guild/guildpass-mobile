// ---------------------------------------------------------------------------
// Database type definitions for the SQLite-backed offline data layer.
// ---------------------------------------------------------------------------

/** Status of an access check operation. */
export type AccessCheckStatus = "granted" | "denied" | "error";

/** Membership status for a wallet in a guild. */
export type MembershipStatus = "active" | "expired" | "revoked" | "unknown";

/** A row in the `guilds` table. */
export interface GuildRow {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  chain_id: number;
  raw_json: string;
  created_at: string;
  updated_at: string;
}

/** A row in the `guild_configs` table. */
export interface GuildConfigRow {
  id: string;
  guild_id: string;
  config_json: string;
  created_at: string;
  updated_at: string;
}

/** A row in the `wallets` table. */
export interface WalletRow {
  id: number;
  address: string;
  label: string | null;
  added_at: string;
}

/** A row in the `roles` table. */
export interface RoleRow {
  id: string;
  guild_id: string;
  name: string;
  permissions: string | null;
  raw_json: string;
  created_at: string;
  updated_at: string;
}

/** A row in the `memberships` table. */
export interface MembershipRow {
  id: number;
  wallet_address: string;
  guild_id: string;
  status: MembershipStatus;
  raw_json: string;
  created_at: string;
  updated_at: string;
}

/** A row in the `user_roles` table. */
export interface UserRoleRow {
  id: number;
  wallet_address: string;
  guild_id: string;
  role_id: string;
  raw_json: string;
  created_at: string;
  updated_at: string;
}

/** A row in the `access_checks` table. */
export interface AccessCheckRow {
  id: string;
  wallet_address: string;
  guild_id: string;
  resource_id: string;
  status: AccessCheckStatus;
  reason: string | null;
  matched_roles_json: string | null;
  required_roles_json: string | null;
  checked_at: string;
  created_at: string;
}

/** A row in the schema_migrations table. */
export interface SchemaMigrationRow {
  version: number;
  name: string;
  applied_at: string;
}

/** A row in the `qr_replay_nonces` table. */
export interface QrReplayNonceRow {
  /** The nonce value (primary key). */
  nonce: string;
  /** Unix epoch milliseconds at which this nonce entry may be safely pruned. */
  expires_at_ms: number;
}

/**
 * A single migration step.
 * `version` is a monotonically increasing integer.
 * `sql` is the SQL to execute (may contain multiple statements separated by `;`).
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Database health check result. */
export interface DbHealthCheck {
  ok: boolean;
  error?: string;
  resetPerformed: boolean;
}
