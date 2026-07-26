// ---------------------------------------------------------------------------
// Fast in-memory mock database for testing.
//
// Implements a subset of the expo-sqlite WebSQLDatabase interface using
// plain JavaScript objects.  No WASM, no native modules — fast and reliable.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface MockResultSetRowList {
  length: number;
  item(i: number): Record<string, unknown>;
  _array: Record<string, unknown>[];
}

export interface MockResultSet {
  rows: MockResultSetRowList;
  insertId: number;
  rowsAffected: number;
}

export interface MockTransaction {
  executeSql(
    sqlStatement: string,
    args?: (string | number | null)[],
    success?: (tx: MockTransaction, resultSet: MockResultSet) => void,
    error?: (tx: MockTransaction, error: Error) => boolean,
  ): void;
}

export interface MockDatabase {
  transaction(
    callback: (tx: MockTransaction) => void,
    errorCallback?: (error: Error) => void,
    successCallback?: () => void,
  ): void;
  readTransaction(
    callback: (tx: MockTransaction) => void,
    errorCallback?: (error: Error) => void,
    successCallback?: () => void,
  ): void;
  closeAsync(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Minimal SQL parser / executor
// ---------------------------------------------------------------------------

interface TableDef {
  name: string;
  columns: string[];
}

interface IndexDef {
  name: string;
  table: string;
}

function parseCreateTable(sql: string): TableDef | null {
  // Extract table name: "CREATE TABLE [IF NOT EXISTS] tablename ("
  const nameMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/i);
  if (!nameMatch) return null;
  const name = nameMatch[1];

  // Find content between the first '(' and last ')'
  const start = sql.indexOf("(");
  const end = sql.lastIndexOf(")");
  if (start === -1 || end === -1 || end <= start) return { name, columns: [] };

  const body = sql.slice(start + 1, end);
  const cols: string[] = [];

  // Split by comma, respecting nested parentheses
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      const firstWord = current.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
      if (
        firstWord &&
        firstWord !== "PRIMARY" &&
        firstWord !== "FOREIGN" &&
        firstWord !== "UNIQUE" &&
        firstWord !== "CHECK" &&
        firstWord !== "CONSTRAINT"
      ) {
        cols.push(current.trim().split(/\s+/)[0]);
      }
      current = "";
    } else {
      current += ch;
    }
  }
  // Handle last column definition
  const firstWord = current.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (
    firstWord &&
    firstWord !== "PRIMARY" &&
    firstWord !== "FOREIGN" &&
    firstWord !== "UNIQUE" &&
    firstWord !== "CHECK" &&
    firstWord !== "CONSTRAINT"
  ) {
    cols.push(current.trim().split(/\s+/)[0]);
  }

  return { name, columns: cols };
}

function parseCreateIndex(sql: string): IndexDef | null {
  const m = sql.match(/CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)/i);
  if (!m) return null;
  return { name: m[1], table: m[2] };
}

function makeRowList(rows: Record<string, unknown>[]): MockResultSetRowList {
  return {
    length: rows.length,
    item(i: number) {
      return rows[i];
    },
    _array: rows,
  };
}

export class MockDb {
  tables = new Map<string, { columns: string[]; rows: Record<string, unknown>[] }>();
  indexes = new Map<string, IndexDef>();
  transactionStack = 0;

  _exec(sql: string, args: (string | number | null)[] = []): MockResultSet {
    // Strip leading SQL comments (e.g. -- comment line)
    const sqlClean = sql
      .trim()
      .replace(/^(\s*--[^\n]*\n)+/g, "")
      .trim();
    const trimmed = sqlClean;
    const upper = sqlClean.toUpperCase();

    // CREATE TABLE
    if (upper.startsWith("CREATE TABLE")) {
      const def = parseCreateTable(sqlClean);
      if (def && !this.tables.has(def.name)) {
        this.tables.set(def.name, { columns: def.columns, rows: [] });
      }
      return { rows: makeRowList([]), insertId: 0, rowsAffected: 0 };
    }

    // CREATE INDEX (store in registry)
    if (upper.startsWith("CREATE INDEX")) {
      const def = parseCreateIndex(trimmed);
      if (def) this.indexes.set(def.name, def);
      return { rows: makeRowList([]), insertId: 0, rowsAffected: 0 };
    }

    // INSERT OR REPLACE / INSERT OR IGNORE
    if (upper.startsWith("INSERT")) {
      const tableMatch = trimmed.match(
        /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
      );
      if (tableMatch) {
        const tableName = tableMatch[1];
        const colNames = tableMatch[2].split(",").map((c) => c.trim());
        const table = this.tables.get(tableName);
        if (table) {
          // Build row from args (parameterized) or inline values
          const row: Record<string, unknown> = {};
          const valueTokens = tableMatch[3].split(",").map((v) => v.trim());
          for (let i = 0; i < colNames.length; i++) {
            if (valueTokens[i] === "?") {
              row[colNames[i]] = args[i] ?? null;
            } else {
              // Try to parse inline value (remove quotes)
              const raw = valueTokens[i];
              if (
                (raw.startsWith("'") && raw.endsWith("'")) ||
                (raw.startsWith('"') && raw.endsWith('"'))
              ) {
                row[colNames[i]] = raw.slice(1, -1);
              } else if (raw.toLowerCase().includes("datetime('now")) {
                row[colNames[i]] = new Date().toISOString();
              } else {
                const num = Number(raw);
                row[colNames[i]] = isNaN(num) ? raw : num;
              }
            }
          }

          // Check for UNIQUE constraint via primary key
          const pkCol = table.columns[0];
          const existingIdx = table.rows.findIndex((r) => r[pkCol] === row[pkCol]);
          const isReplace = upper.includes("OR REPLACE");

          if (existingIdx >= 0) {
            if (isReplace) {
              table.rows[existingIdx] = row;
            }
          } else {
            table.rows.push(row);
          }

          return { rows: makeRowList([]), insertId: table.rows.length, rowsAffected: 1 };
        }
      }
      return { rows: makeRowList([]), insertId: 0, rowsAffected: 0 };
    }

    // SELECT
    if (upper.startsWith("SELECT")) {
      const tableMatch = trimmed.match(/FROM\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        const table = this.tables.get(tableName);
        if (table) {
          let rows = [...table.rows];

          // WHERE clause
          const whereMatch = trimmed.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*$)/is);
          if (whereMatch) {
            const whereClause = whereMatch[1].trim();
            rows = rows.filter((row) => this._evalWhere(row, whereClause, args));
          }

          // ORDER BY
          const orderMatch = trimmed.match(/ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?/i);
          if (orderMatch) {
            const col = orderMatch[1];
            const dir = (orderMatch[2] ?? "ASC").toUpperCase();
            rows.sort((a, b) => {
              const va = String(a[col] ?? "");
              const vb = String(b[col] ?? "");
              return dir === "DESC" ? vb.localeCompare(va) : va.localeCompare(vb);
            });
          }

          // LIMIT / OFFSET
          let limit = rows.length;
          let offset = 0;
          if (upper.includes("LIMIT ?")) {
            const whereClause = whereMatch ? whereMatch[1].trim() : "";
            const whereArgCount = whereClause ? (whereClause.match(/\?/g) || []).length : 0;
            limit = Number(args[whereArgCount] ?? rows.length);
            if (upper.includes("OFFSET ?")) {
              offset = Number(args[whereArgCount + 1] ?? 0);
            }
          } else {
            const limitMatch = trimmed.match(/LIMIT\s+(\d+)/i);
            const offsetMatch = trimmed.match(/OFFSET\s+(\d+)/i);
            if (limitMatch) limit = parseInt(limitMatch[1]);
            if (offsetMatch) offset = parseInt(offsetMatch[1]);
          }

          rows = rows.slice(offset, offset + limit);

          // Handle COUNT(*)
          if (upper.includes("COUNT(*)")) {
            return { rows: makeRowList([{ cnt: rows.length }]), insertId: 0, rowsAffected: 0 };
          }

          // Handle MAX(version)
          const maxMatch = trimmed.match(/MAX\((\w+)\)\s+AS\s+(\w+)/i);
          if (maxMatch) {
            const col = maxMatch[1];
            const alias = maxMatch[2];
            const maxVal = rows.reduce((max, r) => Math.max(max, Number(r[col]) || 0), 0);
            return { rows: makeRowList([{ [alias]: maxVal }]), insertId: 0, rowsAffected: 0 };
          }

          return { rows: makeRowList(rows), insertId: 0, rowsAffected: 0 };
        }
      }
      return { rows: makeRowList([]), insertId: 0, rowsAffected: 0 };
    }

    // DELETE
    if (upper.startsWith("DELETE")) {
      const tableMatch = trimmed.match(/FROM\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        const table = this.tables.get(tableName);
        if (table) {
          const before = table.rows.length;

          // Special-case: DELETE ... WHERE rowid NOT IN (SELECT rowid FROM ...
          //               ORDER BY rowid DESC LIMIT ?)
          // This is the bounded-eviction pattern used by deleteOldestNonces.
          // In the mock, array indices serve as implicit rowids (0-based,
          // insertion order).  We keep the last `limit` rows and drop the rest.
          const evictMatch = trimmed.match(
            /WHERE\s+rowid\s+NOT\s+IN\s*\(\s*SELECT\s+rowid\s+FROM\s+\w+\s+ORDER\s+BY\s+rowid\s+DESC\s+LIMIT\s+\?\s*\)/i,
          );
          if (evictMatch) {
            const limit = Number(args[0] ?? 0);
            if (table.rows.length > limit) {
              // Keep only the newest `limit` rows (tail of the array).
              table.rows = table.rows.slice(table.rows.length - limit);
            }
            return { rows: makeRowList([]), insertId: 0, rowsAffected: before - table.rows.length };
          }

          const whereMatch = trimmed.match(/WHERE\s+(.+)/is);
          if (whereMatch) {
            table.rows = table.rows.filter((row) => !this._evalWhere(row, whereMatch[1], args));
          } else {
            table.rows = [];
          }

          return { rows: makeRowList([]), insertId: 0, rowsAffected: before - table.rows.length };
        }
      }
      return { rows: makeRowList([]), insertId: 0, rowsAffected: 0 };
    }

    // UPDATE
    if (upper.startsWith("UPDATE")) {
      const tableMatch = trimmed.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/is);
      if (tableMatch) {
        const tableName = tableMatch[1];
        const table = this.tables.get(tableName);
        if (table) {
          const setClause = tableMatch[2].trim();
          const setMatch = setClause.match(/(\w+)\s*=\s*\?/);
          const whereClause = tableMatch[3];

          const setCount = (setClause.match(/\?/g) || []).length;
          const setVal = setMatch ? args[0] : undefined;
          const whereArgs = args.slice(setCount);

          let affected = 0;
          for (const row of table.rows) {
            if (!whereClause || this._evalWhere(row, whereClause, whereArgs)) {
              if (setMatch) {
                row[setMatch[1]] = setVal;
              }
              affected++;
            }
          }
          return { rows: makeRowList([]), insertId: 0, rowsAffected: affected };
        }
      }
    }

    // PRAGMA (stub — return empty for unknown pragmas)
    if (upper.startsWith("PRAGMA")) {
      return { rows: makeRowList([]), insertId: 0, rowsAffected: 0 };
    }

    return { rows: makeRowList([]), insertId: 0, rowsAffected: 0 };
  }

  private _evalWhere(
    row: Record<string, unknown>,
    clause: string,
    args: (string | number | null)[],
  ): boolean {
    // Handle "col = ?"
    const eqMatch = clause.match(/^(\w+)\s*=\s*\?$/);
    if (eqMatch) {
      const col = eqMatch[1];
      const val = args[0];
      return String(row[col] ?? "") === String(val ?? "");
    }

    // Handle "col > ?"  (numeric-aware)
    const gtMatch = clause.match(/^(\w+)\s*>\s*\?$/);
    if (gtMatch) {
      const col = gtMatch[1];
      const rowVal = Number(row[col] ?? "");
      const argVal = Number(args[0] ?? "");
      if (!isNaN(rowVal) && !isNaN(argVal)) return rowVal > argVal;
      return String(row[col] ?? "") > String(args[0] ?? "");
    }

    // Handle "col < ?"  (numeric-aware)
    const ltMatch = clause.match(/^(\w+)\s*<\s*\?$/);
    if (ltMatch) {
      const col = ltMatch[1];
      const rowVal = Number(row[col] ?? "");
      const argVal = Number(args[0] ?? "");
      if (!isNaN(rowVal) && !isNaN(argVal)) return rowVal < argVal;
      return String(row[col] ?? "") < String(args[0] ?? "");
    }

    // Handle "col <= ?"  (numeric-aware)
    const lteMatch = clause.match(/^(\w+)\s*<=\s*\?$/);
    if (lteMatch) {
      const col = lteMatch[1];
      const rowVal = Number(row[col] ?? "");
      const argVal = Number(args[0] ?? "");
      if (!isNaN(rowVal) && !isNaN(argVal)) return rowVal <= argVal;
      return String(row[col] ?? "") <= String(args[0] ?? "");
    }

    // Handle "col >= ?"  (numeric-aware)
    const gteMatch = clause.match(/^(\w+)\s*>=\s*\?$/);
    if (gteMatch) {
      const col = gteMatch[1];
      const rowVal = Number(row[col] ?? "");
      const argVal = Number(args[0] ?? "");
      if (!isNaN(rowVal) && !isNaN(argVal)) return rowVal >= argVal;
      return String(row[col] ?? "") >= String(args[0] ?? "");
    }

    // Handle "col = ? AND col2 = ?"
    const andMatch = clause.match(/^(\w+)\s*=\s*\?\s+AND\s+(\w+)\s*=\s*\?$/);
    if (andMatch) {
      const col1 = andMatch[1];
      const col2 = andMatch[2];
      return (
        String(row[col1] ?? "") === String(args[0] ?? "") &&
        String(row[col2] ?? "") === String(args[1] ?? "")
      );
    }

    // Handle "col = ? AND col2 = ? AND col3 = ?"
    const and3Match = clause.match(
      /^(\w+)\s*=\s*\?\s+AND\s+(\w+)\s*=\s*\?\s+AND\s+(\w+)\s*=\s*\?$/,
    );
    if (and3Match) {
      return (
        String(row[and3Match[1]] ?? "") === String(args[0] ?? "") &&
        String(row[and3Match[2]] ?? "") === String(args[1] ?? "") &&
        String(row[and3Match[3]] ?? "") === String(args[2] ?? "")
      );
    }

    // Handle "col NOT LIKE ?" (for sqlite_master queries)
    const notLikeMatch = clause.match(/^(\w+)\s+NOT\s+LIKE\s+'([^']*)'$/);
    if (notLikeMatch) {
      const col = notLikeMatch[1];
      const pattern = notLikeMatch[2].replace(/%/g, ".*");
      return !new RegExp(pattern).test(String(row[col] ?? ""));
    }

    // Handle "col LIKE ?"
    const likeMatch = clause.match(/^(\w+)\s+LIKE\s+'([^']*)'$/);
    if (likeMatch) {
      const col = likeMatch[1];
      const pattern = likeMatch[2].replace(/%/g, ".*");
      return new RegExp(pattern).test(String(row[col] ?? ""));
    }

    // Handle "col != ?"
    const neqMatch = clause.match(/^(\w+)\s*!=\s*'([^']*)'$/);
    if (neqMatch) {
      return String(row[neqMatch[1]] ?? "") !== neqMatch[2];
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMockDb(): MockDatabase & { _mock: MockDb } {
  const mock = new MockDb();

  // Pre-populate sqlite_master for schema introspection queries
  mock.tables.set("sqlite_master", {
    columns: ["type", "name", "tbl_name", "sql"],
    rows: [],
  });

  const db: MockDatabase & { _mock: MockDb } = {
    _mock: mock,

    transaction(callback, errorCallback, successCallback) {
      try {
        callback(makeMockTx(mock));
        successCallback?.();
      } catch (e) {
        errorCallback?.(e as Error);
      }
    },

    readTransaction(callback, errorCallback, successCallback) {
      try {
        callback(makeMockTx(mock));
        successCallback?.();
      } catch (e) {
        errorCallback?.(e as Error);
      }
    },

    closeAsync() {
      return Promise.resolve();
    },
  };

  return db;
}

function makeMockTx(mock: MockDb): MockTransaction {
  const tx: MockTransaction = {
    executeSql(
      sqlStatement: string,
      args?: (string | number | null)[],
      success?: (tx: MockTransaction, resultSet: MockResultSet) => void,
      error?: (tx: MockTransaction, err: Error) => boolean,
    ) {
      try {
        const result = mock._exec(sqlStatement, args ?? []);

        // Track created tables/indexes in sqlite_master
        const upper = sqlStatement.trim().toUpperCase();
        if (upper.startsWith("CREATE TABLE")) {
          const def = parseCreateTable(sqlStatement);
          if (def) {
            const master = mock.tables.get("sqlite_master")!;
            if (!master.rows.find((r) => r.name === def.name && r.type === "table")) {
              master.rows.push({
                type: "table",
                name: def.name,
                tbl_name: def.name,
                sql: sqlStatement,
              });
            }
          }
        } else if (upper.startsWith("CREATE INDEX")) {
          const def = parseCreateIndex(sqlStatement);
          if (def) {
            const master = mock.tables.get("sqlite_master")!;
            if (!master.rows.find((r) => r.name === def.name && r.type === "index")) {
              master.rows.push({
                type: "index",
                name: def.name,
                tbl_name: def.table,
                sql: sqlStatement,
              });
            }
          }
        }

        success?.(tx, result);
      } catch (e) {
        const shouldAbort = error?.(tx, e as Error);
        if (shouldAbort !== true) throw e;
      }
    },
  };
  return tx;
}
