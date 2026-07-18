// ---------------------------------------------------------------------------
// Database module — barrel export.
// ---------------------------------------------------------------------------

export { getDatabase, initDatabase, checkDatabaseHealth, resetDatabase } from "./connection";
export { applyMigrations, getAppliedMigrations } from "./migrations";
export { MIGRATIONS, SCHEMA_VERSION_1 } from "./schema";
export * as dal from "./dal";
export {
  createSqlitePersister,
  resolveFromDal,
  isDalBackedQuery,
  DAL_BACKED_QUERY_ROOTS,
} from "./queryAdapter";
export type { DalBackedQueryRoot } from "./queryAdapter";
export type * from "./types";
