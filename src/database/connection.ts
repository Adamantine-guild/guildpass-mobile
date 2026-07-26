// ---------------------------------------------------------------------------
// Database connection manager.
//
// Responsibilities:
//   1. Open (or create) the SQLite database file via `expo-sqlite`.
//   2. Run a health check (PRAGMA integrity_check) at startup.
//   3. Detect corruption and safely reset the database file.
//   4. Expose a singleton connection used by the migration runner and DAL.
// ---------------------------------------------------------------------------

import * as SQLite from "expo-sqlite";
import type { DbHealthCheck } from "./types";

/** Name of the SQLite database file on disk. */
export const DB_NAME = "guildpass.db";

let _db: SQLite.WebSQLDatabase | null = null;

/**
 * Returns the shared database connection, opening it if necessary.
 * Call `initDatabase()` at app startup before any DAL usage.
 */
export function getDatabase(): SQLite.WebSQLDatabase {
  if (!_db) {
    _db = SQLite.openDatabase(DB_NAME);
  }
  return _db;
}

/**
 * Reset the database by closing the current handle and
 * deleting the file.  On the next `getDatabase()` call a fresh
 * database will be created.
 */
export async function resetDatabase(): Promise<void> {
  if (_db) {
    try {
      await _db.closeAsync();
    } catch {
      // Ignore errors during close — the file may already be gone.
    }
    _db = null;
  }
  // expo-sqlite 14+ exposes deleteAsync; older versions require a manual file delete.
  // We wrap in try/catch because the file may not exist.
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch {
    // File may not exist; this is safe.
  }
}

/**
 * Performs a health check on the database.
 *
 * - Runs `PRAGMA integrity_check`.
 * - If the check fails, resets the database and returns `{ ok: true, resetPerformed: true }`.
 * - If the check passes, returns `{ ok: true, resetPerformed: false }`.
 */
export async function checkDatabaseHealth(): Promise<DbHealthCheck> {
  const db = getDatabase();

  try {
    const result = await runSqlReadonly(db, "PRAGMA integrity_check");
    const rows = result.rows as unknown as { integrity_check: string }[];
    const ok = rows.length === 1 && rows[0].integrity_check === "ok";

    if (ok) {
      return { ok: true, resetPerformed: false };
    }

    console.warn("[db] integrity_check failed:", rows[0]?.integrity_check ?? "unknown error");
    await resetDatabase();
    return { ok: true, resetPerformed: true };
  } catch (err) {
    console.error("[db] integrity_check threw:", err);
    await resetDatabase();
    return { ok: true, resetPerformed: true };
  }
}

/**
 * Initialize the database: open it, run health check, then apply
 * pending migrations.  Returns the health-check result so callers
 * can know whether a reset occurred.
 */
export async function initDatabase(
  runMigrations: (db: SQLite.WebSQLDatabase) => Promise<void>,
): Promise<DbHealthCheck> {
  const health = await checkDatabaseHealth();

  // If a reset was performed, get a fresh handle.
  const db = getDatabase();
  await runMigrations(db);

  return health;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function runSqlReadonly(db: SQLite.WebSQLDatabase, sql: string): Promise<SQLite.SQLResultSet> {
  return new Promise((resolve, reject) => {
    db.readTransaction((tx) => {
      tx.executeSql(
        sql,
        [],
        (_tx, resultSet) => resolve(resultSet),
        (_tx, error) => {
          reject(error);
          return true;
        },
      );
    });
  });
}

/**
 * Execute an array of SQL statements in a single write transaction.
 */
export function execInTransaction(db: SQLite.WebSQLDatabase, statements: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx) => {
        for (const sql of statements) {
          const trimmed = sql.trim();
          if (!trimmed) continue;

          // Split multi-statement strings by `;` for older expo-sqlite compat.
          for (const stmt of trimmed.split(";")) {
            const s = stmt.trim();
            if (!s) continue;
            tx.executeSql(s);
          }
        }
      },
      reject,
      resolve,
    );
  });
}

/**
 * Execute a single SQL statement with parameters and return all rows.
 */
export function execAndGetAll<T = Record<string, unknown>>(
  db: SQLite.WebSQLDatabase,
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.readTransaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_tx, resultSet) => {
          const rows: T[] = [];
          for (let i = 0; i < resultSet.rows.length; i++) {
            rows.push(resultSet.rows.item(i) as unknown as T);
          }
          resolve(rows);
        },
        (_tx, error) => {
          reject(error);
          return true;
        },
      );
    });
  });
}

/**
 * Execute a single SQL statement and return the first row (or null).
 */
export async function execAndGetOne<T = Record<string, unknown>>(
  db: SQLite.WebSQLDatabase,
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T | null> {
  const rows = await execAndGetAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}
