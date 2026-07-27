// ---------------------------------------------------------------------------
// Versioned migration runner.
//
// On app startup the runner:
//   1. Ensures the `schema_migrations` table exists.
//   2. Reads the current schema version.
//   3. Applies all pending migrations in version order, each inside a
//      transaction.
//   4. Records each successfully applied migration in `schema_migrations`.
//
// Migrations are defined in `./schema.ts` and are keyed by integer version.
// ---------------------------------------------------------------------------

import type * as SQLite from "expo-sqlite";
import { MIGRATIONS } from "./schema";
import { execInTransaction } from "./connection";
import type { SchemaMigrationRow } from "./types";

/** SQL to create the migrations tracking table (idempotent). */
const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version   INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * Returns the sorted list of pending migration versions.
 */
function pendingVersions(currentVersion: number): number[] {
  return Object.keys(MIGRATIONS)
    .map(Number)
    .filter((v) => v > currentVersion)
    .sort((a, b) => a - b);
}

/**
 * Apply all pending migrations to the database.
 *
 * This function is idempotent — running it on an already-up-to-date
 * database is a no-op.
 */
export async function applyMigrations(db: SQLite.WebSQLDatabase): Promise<void> {
  // 1. Ensure tracking table exists.
  await execInTransaction(db, [CREATE_MIGRATIONS_TABLE]);

  // 2. Determine current version.
  const currentVersion = await getCurrentVersion(db);

  // 3. Apply pending migrations in order.
  const pending = pendingVersions(currentVersion);
  for (const version of pending) {
    const migration = MIGRATIONS[version];
    if (!migration) continue;

    await execInTransaction(db, [migration.sql]);

    // Record the migration.
    await execInTransaction(db, [
      `INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
       VALUES (${version}, '${migration.name.replace(/'/g, "''")}', datetime('now'))`,
    ]);

    console.log(`[db] Applied migration v${version}: ${migration.name}`);
  }
}

/**
 * Read the highest applied migration version from the tracking table.
 */
async function getCurrentVersion(db: SQLite.WebSQLDatabase): Promise<number> {
  return new Promise((resolve) => {
    db.readTransaction((tx) => {
      tx.executeSql(
        "SELECT MAX(version) AS version FROM schema_migrations",
        [],
        (_tx, resultSet) => {
          const rows = resultSet.rows as unknown as SchemaMigrationRow[];
          const version = rows.length > 0 ? (rows[0].version ?? 0) : 0;
          resolve(version);
        },
        () => {
          // Table might not exist yet — that's fine.
          resolve(0);
          return true;
        },
      );
    });
  });
}

/**
 * Returns all applied migration records (for debugging / diagnostics).
 */
export async function getAppliedMigrations(
  db: SQLite.WebSQLDatabase,
): Promise<SchemaMigrationRow[]> {
  return new Promise((resolve) => {
    db.readTransaction((tx) => {
      tx.executeSql(
        "SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC",
        [],
        (_tx, resultSet) => {
          const rows: SchemaMigrationRow[] = [];
          for (let i = 0; i < resultSet.rows.length; i++) {
            rows.push(resultSet.rows.item(i) as unknown as SchemaMigrationRow);
          }
          resolve(rows);
        },
        () => {
          resolve([]);
          return true;
        },
      );
    });
  });
}
