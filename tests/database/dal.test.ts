// ---------------------------------------------------------------------------
// DAL integration tests with mock database.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from "vitest";
import { createMockDb } from "./mock-db";
import { applyMigrations } from "../../src/database/migrations";
import * as dal from "../../src/database/dal";

let db: ReturnType<typeof createMockDb>;

beforeEach(async () => {
  db = createMockDb();
  await applyMigrations(db as never);
});

// ---------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------
describe("Guild CRUD", () => {
  it("upserts and retrieves a guild", async () => {
    await dal.upsertGuild(db as never, {
      id: "guild-1",
      name: "Test Guild",
      description: "Desc",
      icon_url: null,
      chain_id: 1,
      raw_json: JSON.stringify({ id: "guild-1" }),
      updated_at: new Date().toISOString(),
    });
    const g = await dal.getGuildById(db as never, "guild-1");
    expect(g).not.toBeNull();
    expect(g!.name).toBe("Test Guild");
  });

  it("returns null for non-existent guild", async () => {
    const g = await dal.getGuildById(db as never, "nope");
    expect(g).toBeNull();
  });

  it("deletes a guild", async () => {
    await dal.upsertGuild(db as never, {
      id: "gx",
      name: "X",
      description: null,
      icon_url: null,
      chain_id: 1,
      raw_json: "{}",
      updated_at: new Date().toISOString(),
    });
    await dal.deleteGuild(db as never, "gx");
    expect(await dal.getGuildById(db as never, "gx")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------
describe("Wallet CRUD", () => {
  it("adds and retrieves a wallet", async () => {
    const w = await dal.addWallet(db as never, "0xAbcdEF1234567890abcdef1234567890ABCDEF12");
    expect(w.address).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
  });

  it("does not duplicate wallets", async () => {
    await dal.addWallet(db as never, "0x1234567890abcdef1234567890abcdef12345678");
    await dal.addWallet(db as never, "0x1234567890abcdef1234567890abcdef12345678");
    const all = await dal.getAllWallets(db as never);
    expect(all.length).toBe(1);
  });

  it("removes a wallet", async () => {
    await dal.addWallet(db as never, "0x1234567890abcdef1234567890abcdef12345678");
    await dal.removeWallet(db as never, "0x1234567890abcdef1234567890abcdef12345678");
    expect(
      await dal.getWalletByAddress(db as never, "0x1234567890abcdef1234567890abcdef12345678"),
    ).toBeNull();
  });

  it("updates wallet label", async () => {
    await dal.addWallet(db as never, "0x1234567890abcdef1234567890abcdef12345678", "Old");
    await dal.updateWalletLabel(db as never, "0x1234567890abcdef1234567890abcdef12345678", "New");
    const w = await dal.getWalletByAddress(
      db as never,
      "0x1234567890abcdef1234567890abcdef12345678",
    );
    expect(w!.label).toBe("New");
  });
});

// ---------------------------------------------------------------------------
// Access Checks
// ---------------------------------------------------------------------------
describe("Access checks", () => {
  it("inserts and retrieves checks", async () => {
    const now = new Date().toISOString();
    await dal.insertAccessCheck(db as never, {
      id: "c1",
      wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
      guild_id: "g1",
      resource_id: "r1",
      status: "granted",
      reason: null,
      matched_roles_json: "[]",
      required_roles_json: "[]",
      checked_at: now,
      created_at: now,
    });
    const checks = await dal.getAccessChecksByWallet(
      db as never,
      "0x1234567890abcdef1234567890abcdef12345678",
    );
    expect(checks.length).toBe(1);
  });

  it("paginates checks", async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < 25; i++) {
      await dal.insertAccessCheck(db as never, {
        id: `c${i}`,
        wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
        guild_id: "g1",
        resource_id: `r${i}`,
        status: "granted",
        reason: null,
        matched_roles_json: "[]",
        required_roles_json: "[]",
        checked_at: now,
        created_at: now,
      });
    }
    const p1 = await dal.getAccessChecksByWallet(
      db as never,
      "0x1234567890abcdef1234567890abcdef12345678",
      10,
      0,
    );
    const p2 = await dal.getAccessChecksByWallet(
      db as never,
      "0x1234567890abcdef1234567890abcdef12345678",
      10,
      10,
    );
    expect(p1.length).toBe(10);
    expect(p2.length).toBe(10);
  });

  it("counts checks", async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < 10; i++) {
      await dal.insertAccessCheck(db as never, {
        id: `cc${i}`,
        wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
        guild_id: "g1",
        resource_id: "r",
        status: "granted",
        reason: null,
        matched_roles_json: "[]",
        required_roles_json: "[]",
        checked_at: now,
        created_at: now,
      });
    }
    expect(await dal.getAccessCheckCount(db as never)).toBe(10);
  });

  it("deletes checks by wallet", async () => {
    const now = new Date().toISOString();
    await dal.insertAccessCheck(db as never, {
      id: "delme",
      wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
      guild_id: "g1",
      resource_id: "r",
      status: "granted",
      reason: null,
      matched_roles_json: "[]",
      required_roles_json: "[]",
      checked_at: now,
      created_at: now,
    });
    await dal.deleteAccessChecksByWallet(db as never, "0x1234567890abcdef1234567890abcdef12345678");
    expect(
      await dal.getAccessChecksByWallet(db as never, "0x1234567890abcdef1234567890abcdef12345678"),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Bulk / synthetic data
// ---------------------------------------------------------------------------
describe("Bulk operations", () => {
  it("bulk inserts guilds", async () => {
    const guilds = Array.from({ length: 50 }, (_, i) => ({
      id: `b${i}`,
      name: `Bulk ${i}`,
      description: null,
      icon_url: null,
      chain_id: 1,
      raw_json: "{}",
      updated_at: new Date().toISOString(),
    }));
    await dal.bulkInsertGuilds(db as never, guilds);
    const all = await dal.getAllGuilds(db as never);
    expect(all.length).toBe(50);
  });
});

describe("Synthetic data", () => {
  it("generates dataset under performance target", async () => {
    const start = performance.now();
    await dal.generateSyntheticData(db as never, {
      guildCount: 100,
      rolesPerGuild: 5,
      walletCount: 10,
      checksPerWallet: 5,
    });
    const elapsed = performance.now() - start;
    console.log(`[perf] Synthetic data (100/5/10/5): ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
