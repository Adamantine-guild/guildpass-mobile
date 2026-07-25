/**
 * Out-of-tree WalletConnect provider ref (Issue #224).
 *
 * Replaces the `require("./WalletConnectProvider")` call that `useWallet.disconnect()`
 * previously used to reach the module-level ref inside a React component file.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getWalletConnectProvider,
  setWalletConnectProvider,
} from "../src/features/wallet/walletConnectSession";

afterEach(() => {
  setWalletConnectProvider(null);
});

describe("walletConnectSession", () => {
  it("returns null before a provider is registered", () => {
    expect(getWalletConnectProvider()).toBeNull();
  });

  it("returns the registered provider", () => {
    const provider = { disconnect: vi.fn(async () => {}) };

    setWalletConnectProvider(provider);

    expect(getWalletConnectProvider()).toBe(provider);
  });

  it("returns null once the provider is cleared", () => {
    setWalletConnectProvider({ disconnect: vi.fn(async () => {}) });

    setWalletConnectProvider(null);

    expect(getWalletConnectProvider()).toBeNull();
  });
});
