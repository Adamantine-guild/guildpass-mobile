// ---------------------------------------------------------------------------
// Test helpers for database tests.
//
// Provides a fast in-memory mock database (no WASM, no native modules)
// that implements enough of the expo-sqlite WebSQLDatabase interface for
// our DAL, migration runner, and schema tests.
// ---------------------------------------------------------------------------

import { MockDb, createMockDb as _createMockDb } from "./mock-db";

// Re-export types
export type { MockDatabase as TestDb } from "./mock-db";
export type { MockTransaction as TestSQLTransaction } from "./mock-db";
export type { MockResultSet as TestSQLResultSet } from "./mock-db";
export type { MockResultSetRowList as TestSQLResultSetRowList } from "./mock-db";
export type { MockDb } from "./mock-db";

/**
 * Create a test database and return the wrapper (for DAL/migration use)
 * and the raw MockDb (for schema introspection).
 */
export function createTestDbWithRaw(): {
  wrapper: ReturnType<typeof _createMockDb>;
  raw: MockDb;
} {
  const db = _createMockDb();
  return { wrapper: db, raw: db._mock };
}

/**
 * Get the raw mock DB from a wrapper for schema inspection.
 */
export function getRawDb(wrapper: ReturnType<typeof _createMockDb>): MockDb {
  return wrapper._mock;
}

/**
 * Run a query directly on the mock DB and return a single row.
 */
export function rawQueryOne<T = Record<string, unknown>>(
  mock: MockDb,
  sql: string,
): T | undefined {
  const result = mock._exec(sql);
  return result.rows.length > 0 ? (result.rows.item(0) as unknown as T) : undefined;
}

/**
 * Run a query directly on the mock DB and return all rows.
 */
export function rawQueryAll<T = Record<string, unknown>>(
  mock: MockDb,
  sql: string,
): T[] {
  const result = mock._exec(sql);
  const rows: T[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    rows.push(result.rows.item(i) as unknown as T);
  }
  return rows;
}
