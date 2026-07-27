/**
 * Tests for the privySession imperative bridge module.
 *
 * The module exposes Privy SDK state for non-component callers (disconnect,
 * reset). These tests verify the ref-based delegation without pulling in
 * the actual Privy SDK.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setPrivySessionRef,
  privyLogout,
  isPrivyAuthenticated,
  getPrivyWalletAddress,
} from "../src/features/wallet/privySession";

const MOCK_ADDRESS = "0xabc0000000000000000000000000000000000001";

describe("privySession", () => {
  afterEach(() => {
    setPrivySessionRef(null);
  });

  describe("when ref is not set (Privy not configured)", () => {
    it("privyLogout resolves silently", async () => {
      await expect(privyLogout()).resolves.toBeUndefined();
    });

    it("isPrivyAuthenticated returns false", () => {
      expect(isPrivyAuthenticated()).toBe(false);
    });

    it("getPrivyWalletAddress returns null", () => {
      expect(getPrivyWalletAddress()).toBeNull();
    });
  });

  describe("when ref is set and user is authenticated", () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      setPrivySessionRef({
        logout: mockLogout,
        isAuthenticated: () => true,
        getWalletAddress: () => MOCK_ADDRESS,
      });
    });

    it("privyLogout calls the ref logout", async () => {
      await privyLogout();
      expect(mockLogout).toHaveBeenCalledOnce();
    });

    it("isPrivyAuthenticated returns true", () => {
      expect(isPrivyAuthenticated()).toBe(true);
    });

    it("getPrivyWalletAddress returns the embedded address", () => {
      expect(getPrivyWalletAddress()).toBe(MOCK_ADDRESS);
    });
  });

  describe("when ref is set but user is not authenticated", () => {
    beforeEach(() => {
      setPrivySessionRef({
        logout: vi.fn().mockResolvedValue(undefined),
        isAuthenticated: () => false,
        getWalletAddress: () => null,
      });
    });

    it("isPrivyAuthenticated returns false", () => {
      expect(isPrivyAuthenticated()).toBe(false);
    });

    it("getPrivyWalletAddress returns null", () => {
      expect(getPrivyWalletAddress()).toBeNull();
    });
  });

  describe("when logout throws (already logged out)", () => {
    beforeEach(() => {
      setPrivySessionRef({
        logout: vi.fn().mockRejectedValue(new Error("Already logged out")),
        isAuthenticated: () => false,
        getWalletAddress: () => null,
      });
    });

    it("privyLogout swallows the error and resolves", async () => {
      await expect(privyLogout()).resolves.toBeUndefined();
    });
  });

  describe("ref lifecycle", () => {
    it("clearing the ref reverts to safe defaults", () => {
      setPrivySessionRef({
        logout: vi.fn(),
        isAuthenticated: () => true,
        getWalletAddress: () => MOCK_ADDRESS,
      });

      expect(isPrivyAuthenticated()).toBe(true);

      setPrivySessionRef(null);

      expect(isPrivyAuthenticated()).toBe(false);
      expect(getPrivyWalletAddress()).toBeNull();
    });
  });
});
