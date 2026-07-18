// ---------------------------------------------------------------------------
// Schema validation tests.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import { createMockDb, type MockDb } from "./mock-db";
import { MIGRATIONS, SCHEMA_VERSION_1 } from "../../src/database/schema";
import { applyMigrations } from "../../src/database/migrations";

let mock: MockDb;

beforeAll(async () => {
  const db = createMockDb();
  mock = db._mock;
  await applyMigrations(db as never);
});

describe("Schema — tables", () => {
  const tables = [
    "schema_migrations", "guilds", "guild_configs", "wallets",
    "roles", "memberships", "user_roles", "access_checks",
  ];
  for (const t of tables) {
    it(`creates ${t}`, () => expect(mock.tables.has(t)).toBe(true));
  }
});

describe("Schema — indexes", () => {
  const indexes = [
    "idx_guilds_updated_at", "idx_roles_guild_id",
    "idx_memberships_wallet", "idx_memberships_guild",
    "idx_user_roles_wallet", "idx_user_roles_guild",
    "idx_access_checks_wallet", "idx_access_checks_guild",
    "idx_access_checks_checked",
  ];
  for (const idx of indexes) {
    it(`creates ${idx}`, () => expect(mock.indexes.has(idx)).toBe(true));
  }
});

describe("MIGRATIONS registry", () => {
  it("has at least v1", () => expect(MIGRATIONS[1]).toBeDefined());
  it("v1 name is initial-schema", () => expect(MIGRATIONS[1].name).toBe("initial-schema"));
  it("v1 SQL is SCHEMA_VERSION_1", () => expect(MIGRATIONS[1].sql).toBe(SCHEMA_VERSION_1));
  it("all versions are unique", () => {
    const v = Object.keys(MIGRATIONS).map(Number);
    expect(new Set(v).size).toBe(v.length);
  });

  it("SCHEMA_VERSION_1 contains all 7 entity CREATE TABLEs", () => {
    for (const t of ["guilds", "guild_configs", "wallets", "roles", "memberships", "user_roles", "access_checks"]) {
      expect(SCHEMA_VERSION_1).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it("SCHEMA_VERSION_1 contains all 9 CREATE INDEXes", () => {
    for (const idx of [
      "idx_guilds_updated_at", "idx_roles_guild_id", "idx_memberships_wallet",
      "idx_memberships_guild", "idx_user_roles_wallet", "idx_user_roles_guild",
      "idx_access_checks_wallet", "idx_access_checks_guild", "idx_access_checks_checked",
    ]) {
      expect(SCHEMA_VERSION_1).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
    }
  });

  it("all migration SQL strings are non-empty", () => {
    for (const [v, m] of Object.entries(MIGRATIONS)) {
      expect(m.sql.trim().length, `v${v}`).toBeGreaterThan(0);
      expect(m.name.trim().length, `v${v}`).toBeGreaterThan(0);
    }
  });
});
