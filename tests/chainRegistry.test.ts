/**
 * chainRegistry.test.ts
 *
 * Unit tests for src/lib/chainRegistry.ts (Issue #100).
 *
 * Verifies that:
 *  - Known chain IDs are correctly identified
 *  - Unknown chain IDs return graceful fallbacks (never throw)
 *  - Display names follow the expected format
 */

import { describe, it, expect } from "vitest";
import {
  isKnownChainId,
  getChainInfo,
  getChainDisplayName,
  KNOWN_CHAINS,
} from "../src/lib/chainRegistry";

// A chain ID that is intentionally absent from the registry (mirrors the
// GUILD_UNKNOWN_CHAIN_FIXTURE value used in integration tests).
const UNRECOGNISED_CHAIN_ID = 999999;

describe("chainRegistry – isKnownChainId", () => {
  it("returns true for Ethereum mainnet (chainId 1)", () => {
    expect(isKnownChainId(1)).toBe(true);
  });

  it("returns true for Sepolia testnet (chainId 11155111)", () => {
    expect(isKnownChainId(11155111)).toBe(true);
  });

  it("returns true for Polygon mainnet (chainId 137)", () => {
    expect(isKnownChainId(137)).toBe(true);
  });

  it("returns true for Base mainnet (chainId 8453)", () => {
    expect(isKnownChainId(8453)).toBe(true);
  });

  it("returns false for an unrecognised chain ID", () => {
    expect(isKnownChainId(UNRECOGNISED_CHAIN_ID)).toBe(false);
  });

  it("returns false for chain ID 0", () => {
    expect(isKnownChainId(0)).toBe(false);
  });

  it("returns false for a negative chain ID", () => {
    expect(isKnownChainId(-1)).toBe(false);
  });

  it("covers every entry in KNOWN_CHAINS", () => {
    for (const chain of KNOWN_CHAINS) {
      expect(isKnownChainId(chain.chainId)).toBe(true);
    }
  });
});

describe("chainRegistry – getChainInfo", () => {
  it("returns ChainInfo for Ethereum mainnet", () => {
    const info = getChainInfo(1);
    expect(info).not.toBeNull();
    expect(info?.chainId).toBe(1);
    expect(typeof info?.name).toBe("string");
    expect(typeof info?.shortName).toBe("string");
    expect(typeof info?.isTestnet).toBe("boolean");
  });

  it("marks mainnet chains as isTestnet: false", () => {
    const eth = getChainInfo(1);
    const polygon = getChainInfo(137);
    const base = getChainInfo(8453);

    expect(eth?.isTestnet).toBe(false);
    expect(polygon?.isTestnet).toBe(false);
    expect(base?.isTestnet).toBe(false);
  });

  it("marks testnet chains as isTestnet: true", () => {
    const sepolia = getChainInfo(11155111);
    const mumbai = getChainInfo(80001);

    expect(sepolia?.isTestnet).toBe(true);
    expect(mumbai?.isTestnet).toBe(true);
  });

  it("returns null for an unrecognised chain ID – does not throw", () => {
    expect(() => getChainInfo(UNRECOGNISED_CHAIN_ID)).not.toThrow();
    expect(getChainInfo(UNRECOGNISED_CHAIN_ID)).toBeNull();
  });
});

describe("chainRegistry – getChainDisplayName", () => {
  it("returns a short human-readable name for Ethereum mainnet", () => {
    const name = getChainDisplayName(1);
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
    // Should not be the fallback
    expect(name).not.toBe("Unsupported network");
  });

  it("returns a short human-readable name for Sepolia", () => {
    const name = getChainDisplayName(11155111);
    expect(name).toBe("Sepolia");
  });

  it("returns a short human-readable name for Base mainnet", () => {
    const name = getChainDisplayName(8453);
    expect(name).toBe("Base");
  });

  it('returns "Unsupported network" for an unrecognised chain ID – does not throw', () => {
    expect(() => getChainDisplayName(UNRECOGNISED_CHAIN_ID)).not.toThrow();
    expect(getChainDisplayName(UNRECOGNISED_CHAIN_ID)).toBe("Unsupported network");
  });

  it('returns "Unsupported network" for chain ID 0', () => {
    expect(getChainDisplayName(0)).toBe("Unsupported network");
  });
});

describe("chainRegistry – KNOWN_CHAINS integrity", () => {
  it("contains no duplicate chain IDs", () => {
    const ids = KNOWN_CHAINS.map((c) => c.chainId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every entry has a non-empty name and shortName", () => {
    for (const chain of KNOWN_CHAINS) {
      expect(chain.name.trim().length).toBeGreaterThan(0);
      expect(chain.shortName.trim().length).toBeGreaterThan(0);
    }
  });

  it("every chainId is a positive integer", () => {
    for (const chain of KNOWN_CHAINS) {
      expect(Number.isInteger(chain.chainId)).toBe(true);
      expect(chain.chainId).toBeGreaterThan(0);
    }
  });
});
