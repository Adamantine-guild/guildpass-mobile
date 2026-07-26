/**
 * Legacy WebSQL type shim for expo-sqlite.
 *
 * The database layer (dal.ts, migrations.ts, queryAdapter.ts, connection.ts,
 * qrReplayGuard.ts) was written against expo-sqlite v11/v12, which exposed
 * the WebSQL-style API (openDatabase / transaction / executeSql).
 *
 * expo-sqlite v13+ replaced that API entirely with a new async SQLiteDatabase
 * API.  The installed version (57.x) no longer exports WebSQLDatabase or the
 * surrounding types.  This file re-declares them as a module augmentation so
 * TypeScript remains happy until the database layer is migrated to the new API.
 *
 * NOTE: No runtime behaviour is changed here.  These are type-only declarations.
 */

declare module "expo-sqlite" {
  // ----- Legacy WebSQL transaction types -------------------------------------

  interface SQLStatementCallback {
    (transaction: SQLTransaction, resultSet: SQLResultSet): void;
  }

  interface SQLStatementErrorCallback {
    (transaction: SQLTransaction, error: Error): boolean;
  }

  interface SQLResultSet {
    insertId: number;
    rowsAffected: number;
    rows: SQLResultSetRowList;
  }

  interface SQLResultSetRowList {
    readonly length: number;
    item(index: number): Record<string, unknown>;
    /** Non-standard but commonly present in expo-sqlite legacy builds. */
    _array: Record<string, unknown>[];
  }

  interface SQLTransaction {
    executeSql(
      sqlStatement: string,
      arguments?: (string | number | null | boolean | Uint8Array)[],
      callback?: SQLStatementCallback,
      errorCallback?: SQLStatementErrorCallback,
    ): void;
  }

  interface SQLTransactionCallback {
    (transaction: SQLTransaction): void;
  }

  interface SQLTransactionErrorCallback {
    (error: Error): void;
  }

  // ----- Legacy WebSQLDatabase interface ------------------------------------

  interface WebSQLDatabase {
    /** Run statements in a read-write transaction. */
    transaction(
      callback: SQLTransactionCallback,
      errorCallback?: SQLTransactionErrorCallback,
      successCallback?: () => void,
    ): void;

    /** Run statements in a read-only transaction. */
    readTransaction(
      callback: SQLTransactionCallback,
      errorCallback?: SQLTransactionErrorCallback,
      successCallback?: () => void,
    ): void;

    /** Close the database handle and release native resources. */
    closeAsync(): Promise<void>;
  }

  // ----- Legacy factory functions and utility methods -----------------------

  /**
   * Open (or create) a SQLite database by name.
   * Returns a legacy WebSQLDatabase handle.
   *
   * @deprecated Use the new SQLiteDatabase API introduced in expo-sqlite v13.
   */
  function openDatabase(
    name: string,
    version?: string,
    description?: string,
    size?: number,
  ): WebSQLDatabase;

  /**
   * Delete a database file asynchronously.
   */
  function deleteDatabaseAsync(name: string): Promise<void>;
}
