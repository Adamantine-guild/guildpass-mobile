// ---------------------------------------------------------------------------
// TanStack Query Persister adapter for the SQLite database.
//
// This replaces the AsyncStorage-based persister for offline query data.
// Instead of serialising the entire QueryCache as a flat JSON blob, we:
//   1. Intercept successful query results and persist them to the relational
//      tables via the DAL.
//   2. On hydration, repopulate the QueryCache from the relational tables.
//
// The adapter implements the `Persister` interface expected by
// `@tanstack/react-query-persist-client`.
// ---------------------------------------------------------------------------

import type { Persister, QueryClient } from "@tanstack/react-query";
import { getDatabase } from "./connection";
import * as dal from "./dal";
import {
  DAL_BACKED_QUERY_ROOTS as _DAL_BACKED_QUERY_ROOTS,
  isDalBackedQuery as _isDalBackedQuery,
} from "../lib/queryKeys";

/** Prefix used to namespace persisted queries in the relational store. */
const QUERY_CACHE_VERSION = 1;

/**
 * Creates a TanStack Query `Persister` backed by the local SQLite database.
 *
 * The persister stores the *entire* dehydrated QueryClient state as a single
 * JSON blob in a dedicated key-value table (for compatibility with the
 * TanStack persist interface), BUT the DAL also maintains the normalised
 * relational tables so that direct DAL queries remain available for
 * relational access patterns.
 */
export function createSqlitePersister(): Persister {
  return {
    persistClient: async (client: QueryClient) => {
      const db = getDatabase();
      const dehydrated = JSON.stringify(client);

      await new Promise<void>((resolve, reject) => {
        db.transaction((tx) => {
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS _query_cache (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )`,
            [],
          );
          tx.executeSql(
            `INSERT OR REPLACE INTO _query_cache (key, value, updated_at)
             VALUES (?, ?, ?)`,
            [`v${QUERY_CACHE_VERSION}`, dehydrated, new Date().toISOString()],
            () => resolve(),
            (_tx, err) => { reject(err); return true; },
          );
        });
      });
    },

    restoreClient: async (): Promise<QueryClient | undefined> => {
      const db = getDatabase();

      // Ensure table exists before we try to read
      await new Promise<void>((resolve) => {
        db.transaction((tx) => {
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS _query_cache (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )`,
            [],
            () => resolve(),
            () => resolve(),
          );
        });
      });

      const value = await new Promise<string | null>((resolve) => {
        db.readTransaction((tx) => {
          tx.executeSql(
            "SELECT value FROM _query_cache WHERE key = ?",
            [`v${QUERY_CACHE_VERSION}`],
            (_tx, resultSet) => {
              if (resultSet.rows.length > 0) {
                resolve(resultSet.rows.item(0).value as string);
              } else {
                resolve(null);
              }
            },
            () => {
              resolve(null);
              return true;
            },
          );
        });
      });

      if (!value) return undefined;

      try {
        return JSON.parse(value) as QueryClient;
      } catch {
        console.warn("[db] Failed to parse persisted query cache, discarding.");
        return undefined;
      }
    },

    removeClient: async (): Promise<void> => {
      const db = getDatabase();
      await new Promise<void>((resolve) => {
        db.transaction((tx) => {
          tx.executeSql(
            "DELETE FROM _query_cache WHERE key = ?",
            [`v${QUERY_CACHE_VERSION}`],
            () => resolve(),
            () => resolve(),
          );
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Selective hydration helpers
//
// These allow the DAL to serve as a source-of-truth for specific query keys
// when the device is offline, without hydrating the entire QueryClient.
// ---------------------------------------------------------------------------

export { _DAL_BACKED_QUERY_ROOTS as DAL_BACKED_QUERY_ROOTS };
export type DalBackedQueryRoot = (typeof _DAL_BACKED_QUERY_ROOTS)[number];

export { _isDalBackedQuery as isDalBackedQuery };

/**
 * Try to resolve a query from the DAL.  Returns `undefined` if no cached
 * data is available, so the caller can fall back to a network request.
 */
export async function resolveFromDal(
  queryKey: readonly unknown[],
): Promise<unknown | undefined> {
  const db = getDatabase();
  const root = queryKey[0] as string;

  switch (root) {
    case "guild": {
      const guildId = queryKey[1] as string;
      if (!guildId) return undefined;
      const guild = await dal.getGuildById(db, guildId);
      return guild ? JSON.parse(guild.raw_json) : undefined;
    }

    case "guild-config": {
      const guildId = queryKey[1] as string;
      if (!guildId) return undefined;
      const config = await dal.getGuildConfigByGuildId(db, guildId);
      return config ? JSON.parse(config.config_json) : undefined;
    }

    case "guild-roles": {
      const guildId = queryKey[1] as string;
      if (!guildId) return undefined;
      const roles = await dal.getRolesByGuildId(db, guildId);
      return roles.map((r) => JSON.parse(r.raw_json));
    }

    case "membership": {
      const walletAddress = queryKey[1] as string;
      const guildId = queryKey[2] as string;
      if (!walletAddress || !guildId) return undefined;
      const membership = await dal.getMembershipByWalletAndGuild(db, walletAddress, guildId);
      return membership ? JSON.parse(membership.raw_json) : undefined;
    }

    case "memberships": {
      const walletAddress = queryKey[1] as string;
      if (!walletAddress) return undefined;
      const memberships = await dal.getMembershipsByWallet(db, walletAddress);
      return memberships.map((m) => JSON.parse(m.raw_json));
    }

    case "user-roles": {
      const walletAddress = queryKey[1] as string;
      const guildId = queryKey[2] as string;
      if (!walletAddress || !guildId) return undefined;
      const roles = await dal.getUserRolesByWalletAndGuild(db, walletAddress, guildId);
      return roles.map((r) => JSON.parse(r.raw_json));
    }

    default:
      return undefined;
  }
}
