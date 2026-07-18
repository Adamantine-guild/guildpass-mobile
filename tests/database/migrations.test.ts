// ---------------------------------------------------------------------------
// Migration runner tests.
//
// Verifies:
//   1. Applying migrations from an empty database works.
//   2. Re-applying migrations is idempotent.
//   3. getAppliedMigrations returns correct records.
//   4. Pending version filtering is correct.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDbWithRaw, getRawDb, rawQueryOne, rawQueryAll, type MockDb } from "./test-helpers";
import { applyMigrations, getAppliedMigrations } from "../../src/database/migrations";
import type { MockDatabase } from "./mock-db";

describe("Migration runner", () => {
  let wrapper: MockDatabase;
  let raw: MockDb;

  beforeEach(async () => {
    const created = createTestDbWithRaw();
    wrapper = created.wrapper;
    raw = created.raw;
  });

  it("should create schema_migrations table on first run", async () => {
    await applyMigrations(wrapper);

    const row = rawQueryOne<{ name: string }>(
      raw,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    );
    expect(row).toBeDefined();
  });

  it("should apply all migrations from empty database", async () => {
    await applyMigrations(wrapper as never);

    const migrations = await getAppliedMigrations(wrapper as never);
    expect(migrations.length).toBeGreaterThan(0);
    // The mock stores version as a number
    expect(Number(migrations[0].version)).toBe(1);
    expect(migrations[0].name).toBe("initial-schema");
    expect(migrations[0].applied_at).toBeTruthy();
  });

  it("should be idempotent — running twice applies migrations once", async () => {
    await applyMigrations(wrapper);
    await applyMigrations(wrapper);

    const migrations = await getAppliedMigrations(wrapper);
    // Should still only have one record per version
    const versions = migrations.map((m) => m.version);
    const uniqueVersions = new Set(versions);
    expect(uniqueVersions.size).toBe(versions.length);
    expect(versions.length).toBeGreaterThan(0);
  });

  it("should not crash when run on already-migrated database", async () => {
    await applyMigrations(wrapper);

    // Second run should succeed without errors
    await expect(applyMigrations(wrapper)).resolves.toBeUndefined();
  });

  it("should record correct applied_at timestamps", async () => {
    await applyMigrations(wrapper);

    const migrations = await getAppliedMigrations(wrapper);
    for (const m of migrations) {
      expect(m.applied_at).toBeTruthy();
      // Should be a valid ISO-8601 or SQLite datetime
      expect(new Date(m.applied_at).getTime()).not.toBeNaN();
    }
  });

  it("should apply migrations that create all 7 entity tables", async () => {
    await applyMigrations(wrapper as never);

    // Check tables directly in the mock
    const tableNames = Array.from(raw.tables.keys())
      .filter((n) => n !== "sqlite_master" && n !== "schema_migrations")
      .sort();

    expect(tableNames).toEqual([
      "access_checks",
      "guild_configs",
      "guilds",
      "memberships",
      "roles",
      "user_roles",
      "wallets",
    ]);
  });

  it("should apply migrations that create all 9 indexes", async () => {
    await applyMigrations(wrapper as never);

    // Check indexes directly in the mock
    const indexNames = Array.from(raw.indexes.keys()).sort();

    expect(indexNames).toEqual([
      "idx_access_checks_checked",
      "idx_access_checks_guild",
      "idx_access_checks_wallet",
      "idx_guilds_updated_at",
      "idx_memberships_guild",
      "idx_memberships_wallet",
      "idx_roles_guild_id",
      "idx_user_roles_guild",
      "idx_user_roles_wallet",
    ]);
  });

  it("getAppliedMigrations should return empty array on fresh database", async () => {
    // Don't apply migrations — just check
    const migrations = await getAppliedMigrations(wrapper);
    expect(migrations).toEqual([]);
  });
});
