// ---------------------------------------------------------------------------
// Data Access Layer (DAL)
//
// Thin typed wrappers around raw SQL for each entity table.  Every method
// receives the database handle explicitly (no hidden global state) so tests
// can supply an in-memory or test database.
//
// Design principles:
//   - All write operations use INSERT OR REPLACE / UPSERT semantics.
//   - Batch operations use transactions for throughput.
//   - Timestamps are ISO-8601 strings set by the caller (usually `new Date().toISOString()`).
// ---------------------------------------------------------------------------

import type * as SQLite from "expo-sqlite";
import { execInTransaction, execAndGetAll, execAndGetOne } from "./connection";
import type {
  GuildRow,
  GuildConfigRow,
  WalletRow,
  RoleRow,
  MembershipRow,
  UserRoleRow,
  AccessCheckRow,
  AccessCheckStatus,
  MembershipStatus,
  QrReplayNonceRow,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nowISO = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------

export async function upsertGuild(
  db: SQLite.WebSQLDatabase,
  guild: Omit<GuildRow, "created_at"> & { created_at?: string },
): Promise<void> {
  const created = guild.created_at ?? nowISO();
  await execInTransaction(db, [
    `INSERT OR REPLACE INTO guilds (id, name, description, icon_url, chain_id, raw_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ]);
  // We need to use parameterised queries; the execInTransaction API here
  // is not ideal for parameterised — so we use a raw approach with execSql.
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `INSERT OR REPLACE INTO guilds (id, name, description, icon_url, chain_id, raw_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          guild.id,
          guild.name,
          guild.description ?? null,
          guild.icon_url ?? null,
          guild.chain_id,
          guild.raw_json,
          created,
          guild.updated_at,
        ],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

export async function getGuildById(
  db: SQLite.WebSQLDatabase,
  id: string,
): Promise<GuildRow | null> {
  return execAndGetOne<GuildRow>(db, "SELECT * FROM guilds WHERE id = ?", [id]);
}

export async function getAllGuilds(db: SQLite.WebSQLDatabase): Promise<GuildRow[]> {
  return execAndGetAll<GuildRow>(db, "SELECT * FROM guilds ORDER BY name ASC");
}

export async function getGuildsUpdatedSince(
  db: SQLite.WebSQLDatabase,
  since: string,
): Promise<GuildRow[]> {
  return execAndGetAll<GuildRow>(
    db,
    "SELECT * FROM guilds WHERE updated_at > ? ORDER BY updated_at DESC",
    [since],
  );
}

export async function deleteGuild(db: SQLite.WebSQLDatabase, id: string): Promise<void> {
  await execInTransaction(db, [`DELETE FROM guilds WHERE id = '${id.replace(/'/g, "''")}'`]);
}

// ---------------------------------------------------------------------------
// Guild Configs
// ---------------------------------------------------------------------------

export async function upsertGuildConfig(
  db: SQLite.WebSQLDatabase,
  config: Omit<GuildConfigRow, "created_at"> & { created_at?: string },
): Promise<void> {
  const created = config.created_at ?? nowISO();
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `INSERT OR REPLACE INTO guild_configs (id, guild_id, config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [config.id, config.guild_id, config.config_json, created, config.updated_at],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

export async function getGuildConfigByGuildId(
  db: SQLite.WebSQLDatabase,
  guildId: string,
): Promise<GuildConfigRow | null> {
  return execAndGetOne<GuildConfigRow>(db, "SELECT * FROM guild_configs WHERE guild_id = ?", [
    guildId,
  ]);
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export async function addWallet(
  db: SQLite.WebSQLDatabase,
  address: string,
  label?: string,
): Promise<WalletRow> {
  const addedAt = nowISO();
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `INSERT OR IGNORE INTO wallets (address, label, added_at) VALUES (?, ?, ?)`,
        [address.toLowerCase(), label ?? null, addedAt],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
  const row = await execAndGetOne<WalletRow>(db, "SELECT * FROM wallets WHERE address = ?", [
    address.toLowerCase(),
  ]);
  return row!;
}

export async function getAllWallets(db: SQLite.WebSQLDatabase): Promise<WalletRow[]> {
  return execAndGetAll<WalletRow>(db, "SELECT * FROM wallets ORDER BY added_at DESC");
}

export async function getWalletByAddress(
  db: SQLite.WebSQLDatabase,
  address: string,
): Promise<WalletRow | null> {
  return execAndGetOne<WalletRow>(db, "SELECT * FROM wallets WHERE address = ?", [
    address.toLowerCase(),
  ]);
}

export async function removeWallet(db: SQLite.WebSQLDatabase, address: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "DELETE FROM wallets WHERE address = ?",
        [address.toLowerCase()],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

export async function updateWalletLabel(
  db: SQLite.WebSQLDatabase,
  address: string,
  label: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "UPDATE wallets SET label = ? WHERE address = ?",
        [label, address.toLowerCase()],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function upsertRolesBatch(
  db: SQLite.WebSQLDatabase,
  roles: Omit<RoleRow, "created_at">[],
): Promise<void> {
  const now = nowISO();
  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx) => {
        for (const r of roles) {
          tx.executeSql(
            `INSERT OR REPLACE INTO roles (id, guild_id, name, permissions, raw_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              r.id,
              r.guild_id,
              r.name,
              r.permissions ?? null,
              r.raw_json,
              (r as Partial<RoleRow>).created_at ?? now,
              r.updated_at,
            ],
          );
        }
      },
      reject,
      resolve,
    );
  });
}

export async function getRolesByGuildId(
  db: SQLite.WebSQLDatabase,
  guildId: string,
): Promise<RoleRow[]> {
  return execAndGetAll<RoleRow>(db, "SELECT * FROM roles WHERE guild_id = ? ORDER BY name ASC", [
    guildId,
  ]);
}

export async function deleteRolesByGuildId(
  db: SQLite.WebSQLDatabase,
  guildId: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "DELETE FROM roles WHERE guild_id = ?",
        [guildId],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

export async function upsertMembership(
  db: SQLite.WebSQLDatabase,
  membership: Omit<MembershipRow, "id" | "created_at"> & { id?: number; created_at?: string },
): Promise<void> {
  const now = membership.created_at ?? nowISO();
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      if (membership.id) {
        tx.executeSql(
          `INSERT OR REPLACE INTO memberships (id, wallet_address, guild_id, status, raw_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            membership.id,
            membership.wallet_address,
            membership.guild_id,
            membership.status,
            membership.raw_json,
            now,
            membership.updated_at,
          ],
          () => resolve(),
          (_tx, err) => {
            reject(err);
            return true;
          },
        );
      } else {
        tx.executeSql(
          `INSERT OR REPLACE INTO memberships (wallet_address, guild_id, status, raw_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            membership.wallet_address,
            membership.guild_id,
            membership.status,
            membership.raw_json,
            now,
            membership.updated_at,
          ],
          () => resolve(),
          (_tx, err) => {
            reject(err);
            return true;
          },
        );
      }
    });
  });
}

export async function getMembershipsByWallet(
  db: SQLite.WebSQLDatabase,
  walletAddress: string,
): Promise<MembershipRow[]> {
  return execAndGetAll<MembershipRow>(
    db,
    "SELECT * FROM memberships WHERE wallet_address = ? ORDER BY guild_id ASC",
    [walletAddress.toLowerCase()],
  );
}

export async function getMembershipByWalletAndGuild(
  db: SQLite.WebSQLDatabase,
  walletAddress: string,
  guildId: string,
): Promise<MembershipRow | null> {
  return execAndGetOne<MembershipRow>(
    db,
    "SELECT * FROM memberships WHERE wallet_address = ? AND guild_id = ?",
    [walletAddress.toLowerCase(), guildId],
  );
}

export async function getMembershipsByGuild(
  db: SQLite.WebSQLDatabase,
  guildId: string,
): Promise<MembershipRow[]> {
  return execAndGetAll<MembershipRow>(
    db,
    "SELECT * FROM memberships WHERE guild_id = ? ORDER BY wallet_address ASC",
    [guildId],
  );
}

export async function getAllMemberships(db: SQLite.WebSQLDatabase): Promise<MembershipRow[]> {
  return execAndGetAll<MembershipRow>(db, "SELECT * FROM memberships ORDER BY updated_at DESC");
}

export async function deleteMembershipByWalletAndGuild(
  db: SQLite.WebSQLDatabase,
  walletAddress: string,
  guildId: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "DELETE FROM memberships WHERE wallet_address = ? AND guild_id = ?",
        [walletAddress.toLowerCase(), guildId],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// User Roles
// ---------------------------------------------------------------------------

export async function upsertUserRolesBatch(
  db: SQLite.WebSQLDatabase,
  userRoles: Omit<UserRoleRow, "id" | "created_at">[],
): Promise<void> {
  const now = nowISO();
  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx) => {
        for (const ur of userRoles) {
          tx.executeSql(
            `INSERT OR REPLACE INTO user_roles (wallet_address, guild_id, role_id, raw_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
            [
              ur.wallet_address.toLowerCase(),
              ur.guild_id,
              ur.role_id,
              ur.raw_json,
              (ur as Partial<UserRoleRow>).created_at ?? now,
              ur.updated_at,
            ],
          );
        }
      },
      reject,
      resolve,
    );
  });
}

export async function getUserRolesByWalletAndGuild(
  db: SQLite.WebSQLDatabase,
  walletAddress: string,
  guildId: string,
): Promise<UserRoleRow[]> {
  return execAndGetAll<UserRoleRow>(
    db,
    "SELECT * FROM user_roles WHERE wallet_address = ? AND guild_id = ?",
    [walletAddress.toLowerCase(), guildId],
  );
}

/**
 * Returns all user roles across all wallets for guilds updated in the given
 * time window.  This is the kind of relational query that a flat KV store
 * cannot answer efficiently.
 */
export async function getUserRolesForRecentlyUpdatedGuilds(
  db: SQLite.WebSQLDatabase,
  since: string,
): Promise<(UserRoleRow & { guild_name: string })[]> {
  return execAndGetAll<UserRoleRow & { guild_name: string }>(
    db,
    `SELECT ur.*, g.name AS guild_name
     FROM user_roles ur
     JOIN guilds g ON g.id = ur.guild_id
     WHERE g.updated_at > ?
     ORDER BY ur.wallet_address, g.name ASC`,
    [since],
  );
}

export async function deleteUserRolesByWalletAndGuild(
  db: SQLite.WebSQLDatabase,
  walletAddress: string,
  guildId: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "DELETE FROM user_roles WHERE wallet_address = ? AND guild_id = ?",
        [walletAddress.toLowerCase(), guildId],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Access Checks
// ---------------------------------------------------------------------------

export async function insertAccessCheck(
  db: SQLite.WebSQLDatabase,
  check: AccessCheckRow,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `INSERT OR REPLACE INTO access_checks
         (id, wallet_address, guild_id, resource_id, status, reason,
          matched_roles_json, required_roles_json, checked_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          check.id,
          check.wallet_address.toLowerCase(),
          check.guild_id,
          check.resource_id,
          check.status,
          check.reason ?? null,
          check.matched_roles_json ?? null,
          check.required_roles_json ?? null,
          check.checked_at,
          check.created_at ?? nowISO(),
        ],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

export async function getAccessChecksByWallet(
  db: SQLite.WebSQLDatabase,
  walletAddress: string,
  limit = 20,
  offset = 0,
): Promise<AccessCheckRow[]> {
  return execAndGetAll<AccessCheckRow>(
    db,
    `SELECT * FROM access_checks
     WHERE wallet_address = ?
     ORDER BY checked_at DESC
     LIMIT ? OFFSET ?`,
    [walletAddress.toLowerCase(), limit, offset],
  );
}

export async function getRecentAccessChecks(
  db: SQLite.WebSQLDatabase,
  limit = 50,
): Promise<AccessCheckRow[]> {
  return execAndGetAll<AccessCheckRow>(
    db,
    "SELECT * FROM access_checks ORDER BY checked_at DESC LIMIT ?",
    [limit],
  );
}

export async function getAccessCheckCount(db: SQLite.WebSQLDatabase): Promise<number> {
  const row = await execAndGetOne<{ cnt: number }>(db, "SELECT COUNT(*) AS cnt FROM access_checks");
  return row?.cnt ?? 0;
}

export async function deleteAccessChecksByWallet(
  db: SQLite.WebSQLDatabase,
  walletAddress: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "DELETE FROM access_checks WHERE wallet_address = ?",
        [walletAddress.toLowerCase()],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

export async function deleteAccessChecksOlderThan(
  db: SQLite.WebSQLDatabase,
  cutoffISO: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "DELETE FROM access_checks WHERE checked_at < ?",
        [cutoffISO],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Bulk operations (for synthetic / migration data seeding)
// ---------------------------------------------------------------------------

export async function bulkInsertGuilds(
  db: SQLite.WebSQLDatabase,
  guilds: Omit<GuildRow, "created_at">[],
): Promise<void> {
  const now = nowISO();
  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx) => {
        for (const g of guilds) {
          tx.executeSql(
            `INSERT OR REPLACE INTO guilds (id, name, description, icon_url, chain_id, raw_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              g.id,
              g.name,
              g.description ?? null,
              g.icon_url ?? null,
              g.chain_id,
              g.raw_json,
              (g as Partial<GuildRow>).created_at ?? now,
              g.updated_at,
            ],
          );
        }
      },
      reject,
      resolve,
    );
  });
}

export async function bulkInsertRoles(
  db: SQLite.WebSQLDatabase,
  roles: Omit<RoleRow, "created_at">[],
): Promise<void> {
  const now = nowISO();
  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx) => {
        for (const r of roles) {
          tx.executeSql(
            `INSERT OR REPLACE INTO roles (id, guild_id, name, permissions, raw_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              r.id,
              r.guild_id,
              r.name,
              r.permissions ?? null,
              r.raw_json,
              (r as Partial<RoleRow>).created_at ?? now,
              r.updated_at,
            ],
          );
        }
      },
      reject,
      resolve,
    );
  });
}

// ---------------------------------------------------------------------------
// Synthetic data generator (for performance testing)
// ---------------------------------------------------------------------------

export interface SyntheticDataOptions {
  guildCount: number;
  rolesPerGuild: number;
  walletCount: number;
  checksPerWallet: number;
}

export async function generateSyntheticData(
  db: SQLite.WebSQLDatabase,
  opts: SyntheticDataOptions,
): Promise<void> {
  const now = nowISO();

  const guilds: Omit<GuildRow, "created_at">[] = [];
  const roles: Omit<RoleRow, "created_at">[] = [];
  const wallets: { address: string; label: string | null }[] = [];
  const checks: AccessCheckRow[] = [];

  for (let i = 0; i < opts.guildCount; i++) {
    const guildId = `guild-synth-${i}`;
    guilds.push({
      id: guildId,
      name: `Synthetic Guild ${i}`,
      description: `Auto-generated guild #${i}`,
      icon_url: null,
      chain_id: 1,
      raw_json: JSON.stringify({ id: guildId, name: `Synthetic Guild ${i}` }),
      updated_at: now,
    });

    for (let j = 0; j < opts.rolesPerGuild; j++) {
      const roleId = `role-synth-${i}-${j}`;
      roles.push({
        id: roleId,
        guild_id: guildId,
        name: `Role ${j}`,
        permissions: null,
        raw_json: JSON.stringify({ id: roleId, name: `Role ${j}` }),
        updated_at: now,
      });
    }
  }

  for (let w = 0; w < opts.walletCount; w++) {
    const addr = `0x${w.toString(16).padStart(40, "0")}`;
    wallets.push({ address: addr, label: `Wallet ${w}` });

    for (let c = 0; c < opts.checksPerWallet; c++) {
      const gIdx = c % opts.guildCount;
      checks.push({
        id: `check-synth-${w}-${c}`,
        wallet_address: addr,
        guild_id: `guild-synth-${gIdx}`,
        resource_id: `resource-${c}`,
        status: c % 3 === 0 ? "denied" : "granted",
        reason: c % 3 === 0 ? "Missing required role" : null,
        matched_roles_json: JSON.stringify([`role-synth-${gIdx}-0`]),
        required_roles_json: JSON.stringify([`role-synth-${gIdx}-0`, `role-synth-${gIdx}-1`]),
        checked_at: now,
        created_at: now,
      });
    }
  }

  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx) => {
        for (const g of guilds) {
          tx.executeSql(
            `INSERT OR REPLACE INTO guilds (id, name, description, icon_url, chain_id, raw_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              g.id,
              g.name,
              g.description ?? null,
              g.icon_url ?? null,
              g.chain_id,
              g.raw_json,
              now,
              g.updated_at,
            ],
          );
        }
        for (const r of roles) {
          tx.executeSql(
            `INSERT OR REPLACE INTO roles (id, guild_id, name, permissions, raw_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [r.id, r.guild_id, r.name, r.permissions ?? null, r.raw_json, now, r.updated_at],
          );
        }
        for (const w of wallets) {
          tx.executeSql(
            "INSERT OR IGNORE INTO wallets (address, label, added_at) VALUES (?, ?, ?)",
            [w.address, w.label, now],
          );
        }
        for (const c of checks) {
          tx.executeSql(
            `INSERT OR REPLACE INTO access_checks
           (id, wallet_address, guild_id, resource_id, status, reason,
            matched_roles_json, required_roles_json, checked_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              c.id,
              c.wallet_address,
              c.guild_id,
              c.resource_id,
              c.status,
              c.reason,
              c.matched_roles_json,
              c.required_roles_json,
              c.checked_at,
              c.created_at,
            ],
          );
        }
      },
      reject,
      resolve,
    );
  });
}
// ---------------------------------------------------------------------------
// QR Replay Nonces
// ---------------------------------------------------------------------------

/**
 * Returns true if the given nonce exists in the persisted store,
 * regardless of whether it has expired (pruning is done separately).
 */
export async function hasNonce(db: SQLite.WebSQLDatabase, nonce: string): Promise<boolean> {
  const row = await execAndGetOne<QrReplayNonceRow>(
    db,
    "SELECT nonce FROM qr_replay_nonces WHERE nonce = ?",
    [nonce],
  );
  return row !== null;
}

/**
 * Persist a nonce with its expiry timestamp.
 * Uses INSERT OR REPLACE so re-recording the same nonce is idempotent.
 */
export async function insertNonce(
  db: SQLite.WebSQLDatabase,
  nonce: string,
  expiresAtMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "INSERT OR REPLACE INTO qr_replay_nonces (nonce, expires_at_ms) VALUES (?, ?)",
        [nonce, expiresAtMs],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

/**
 * Delete all nonce rows whose expiry has passed.
 * Call this lazily on each `checkAndRecordNonce` to keep the table small.
 */
export async function pruneExpiredNonces(db: SQLite.WebSQLDatabase, nowMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "DELETE FROM qr_replay_nonces WHERE expires_at_ms <= ?",
        [nowMs],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}

/**
 * Return the number of nonce rows currently in the table.
 */
export async function countNonces(db: SQLite.WebSQLDatabase): Promise<number> {
  const row = await execAndGetOne<{ cnt: number }>(
    db,
    "SELECT COUNT(*) AS cnt FROM qr_replay_nonces",
  );
  return row?.cnt ?? 0;
}

/**
 * Delete the oldest `(total - keepCount)` nonce rows so the table stays
 * bounded at `keepCount` entries.  Rows are ordered oldest-first by rowid
 * (insertion order), mirroring the Map-based eviction strategy.
 *
 * No-ops when the table already has ≤ keepCount rows.
 */
export async function deleteOldestNonces(
  db: SQLite.WebSQLDatabase,
  keepCount: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.transaction((tx) => {
      // Delete all rows whose rowid is not in the newest `keepCount` rowids.
      tx.executeSql(
        `DELETE FROM qr_replay_nonces
         WHERE rowid NOT IN (
           SELECT rowid FROM qr_replay_nonces
           ORDER BY rowid DESC
           LIMIT ?
         )`,
        [keepCount],
        () => resolve(),
        (_tx, err) => {
          reject(err);
          return true;
        },
      );
    });
  });
}
