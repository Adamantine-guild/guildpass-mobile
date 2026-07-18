/**
 * Embedded wallet / social login onboarding (Issue #104)
 *
 * Covers:
 *   1. Deterministic preview-address derivation (valid, stable, distinct).
 *   2. The local provider contract: email normalization/validation,
 *      not-yet-configured social methods failing loudly, the production
 *      tripwire, and that nothing is persisted.
 *   3. The embedded connector conforming to the standard WalletConnector
 *      lifecycle, including provider logout on disconnect.
 *   4. The acceptance criterion, exercised through the REAL useWallet hook:
 *      the social path connects via the shared connector → store → session
 *      sequence with no special-casing, and switching wallets clears the
 *      previous wallet's scoped cache.
 */

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import {
  deriveDeterministicAddress,
  localEmbeddedWalletProvider,
} from "../src/features/wallet/embeddedWallet.provider";
import { createEmbeddedConnector } from "../src/features/wallet/walletConnector.service";
import { validateAndNormalizeAddress } from "../src/lib/walletValidation";
import { useWallet } from "../src/features/wallet/useWallet";
import { useWalletStore } from "../src/features/wallet/wallet.store";
import { useSessionStore } from "../src/features/session/session.store";
import { noopSessionAdapter } from "../src/features/session/session.adapter";
import { queryClient } from "../src/lib/queryClient";

const EMAIL = "newuser@example.com";
const EMAIL_ADDRESS = deriveDeterministicAddress(`email|${EMAIL}`);
const MANUAL_ADDRESS = "0x1234567890123456789012345678901234567890";

type WalletHook = ReturnType<typeof useWallet>;

function renderUseWallet() {
  let hookValue: WalletHook | null = null;
  const HookHarness = () => {
    hookValue = useWallet();
    return null;
  };
  TestRenderer.create(React.createElement(HookHarness));
  return {
    get current(): WalletHook {
      if (!hookValue) throw new Error("Hook did not render");
      return hookValue;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  queryClient.clear();
  useWalletStore.setState({ walletAddress: null, isConnected: false });
  useSessionStore.setState({
    status: "unauthenticated",
    walletAddress: null,
    token: null,
    expiresAt: null,
    adapter: noopSessionAdapter,
  });
});

describe("deterministic preview address derivation", () => {
  it("produces a valid Ethereum-format address accepted by the shared validator", () => {
    const result = validateAndNormalizeAddress(EMAIL_ADDRESS);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.address).toBe(EMAIL_ADDRESS); // already lowercase-normalized
    }
  });

  it("is deterministic: the same identity always yields the same address", () => {
    expect(deriveDeterministicAddress("email|a@b.co")).toBe(
      deriveDeterministicAddress("email|a@b.co"),
    );
  });

  it("yields distinct addresses for distinct identities", () => {
    const a = deriveDeterministicAddress("email|a@b.co");
    const b = deriveDeterministicAddress("email|c@d.co");
    const c = deriveDeterministicAddress("google|a@b.co");
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("local embedded wallet provider", () => {
  it("logs in with a normalized email identity (trimmed, lowercased)", async () => {
    const identity = await localEmbeddedWalletProvider.login("email", {
      email: "  NewUser@Example.COM ",
    });

    expect(identity).toStrictEqual({
      method: "email",
      subject: EMAIL,
      email: EMAIL,
    });
  });

  it("rejects an invalid or missing email with a human-readable error", async () => {
    await expect(
      localEmbeddedWalletProvider.login("email", { email: "not-an-email" }),
    ).rejects.toThrow(/valid email/i);
    await expect(localEmbeddedWalletProvider.login("email")).rejects.toThrow(/valid email/i);
  });

  it("fails loudly for social methods that need a production provider", async () => {
    await expect(localEmbeddedWalletProvider.login("google")).rejects.toThrow(/not configured/i);
    await expect(localEmbeddedWalletProvider.login("apple")).rejects.toThrow(/not configured/i);
  });

  it("refuses to run at all in production builds (fail-closed tripwire)", async () => {
    process.env.EXPO_PUBLIC_APP_ENV = "production";
    try {
      await expect(
        localEmbeddedWalletProvider.login("email", { email: EMAIL }),
      ).rejects.toThrow(/production/i);
    } finally {
      delete process.env.EXPO_PUBLIC_APP_ENV;
    }
  });

  it("provisions the same address for the same identity without persisting anything", async () => {
    const identity = await localEmbeddedWalletProvider.login("email", { email: EMAIL });

    const first = await localEmbeddedWalletProvider.provisionWallet(identity);
    const second = await localEmbeddedWalletProvider.provisionWallet(identity);

    expect(first.address).toBe(second.address);
    expect(first.address).toBe(EMAIL_ADDRESS);
    // Custody promise from SECURITY.md: the preview provider writes no
    // identity or key material to secure storage. (The session store also
    // persists through this mock under "session-storage", so assert no
    // OTHER key is ever written rather than no call at all.)
    const keysWritten = vi.mocked(SecureStore.setItemAsync).mock.calls.map(([key]) => key);
    expect(keysWritten.filter((key) => key !== "session-storage")).toStrictEqual([]);
  });
});

describe("embedded connector", () => {
  it("implements the standard connector lifecycle and revokes the provider session on disconnect", async () => {
    const logoutSpy = vi.spyOn(localEmbeddedWalletProvider, "logout");
    const connector = createEmbeddedConnector(localEmbeddedWalletProvider, "email", {
      email: EMAIL,
    });
    expect(connector.type).toBe("embedded");
    expect(await connector.getAccounts()).toStrictEqual([]);

    const accounts = await connector.connect();
    expect(accounts).toStrictEqual([EMAIL_ADDRESS]);
    expect(await connector.getAccounts()).toStrictEqual(accounts);
    expect(await connector.reconnect()).toStrictEqual(accounts);

    await connector.disconnect();
    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(await connector.getAccounts()).toStrictEqual([]);
  });

  it("surfaces login failures as rejected connects", async () => {
    const connector = createEmbeddedConnector(localEmbeddedWalletProvider, "email", {
      email: "nope",
    });
    await expect(connector.connect()).rejects.toThrow(/valid email/i);
  });
});

describe("acceptance: social onboarding through the real useWallet hook", () => {
  it("connects via the shared connector → store → session path, no special-casing", async () => {
    const wallet = renderUseWallet();

    let result: { success: boolean; error?: string } | undefined;
    await act(async () => {
      result = await wallet.current.connectWithSocial("email", {
        email: ` ${EMAIL.toUpperCase()} `,
      });
    });

    expect(result).toStrictEqual({ success: true });
    expect(useWalletStore.getState().isConnected).toBe(true);
    expect(useWalletStore.getState().walletAddress).toBe(EMAIL_ADDRESS);
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().walletAddress).toBe(EMAIL_ADDRESS);
  });

  it("returns the provider's validation error without connecting", async () => {
    const wallet = renderUseWallet();

    let result: { success: boolean; error?: string } | undefined;
    await act(async () => {
      result = await wallet.current.connectWithSocial("email", { email: "nope" });
    });

    expect(result?.success).toBe(false);
    expect(result?.error).toMatch(/valid email/i);
    expect(useWalletStore.getState().isConnected).toBe(false);
  });

  it("clears the previous wallet's scoped cache when connecting over an existing wallet", async () => {
    const wallet = renderUseWallet();
    await act(async () => {
      wallet.current.connectManually(MANUAL_ADDRESS);
    });
    queryClient.setQueryData(["membership", MANUAL_ADDRESS, "guild_abc"], { isActive: true });
    queryClient.setQueryData(["guild", "guild_abc"], { id: "guild_abc" });

    await act(async () => {
      await wallet.current.connectWithSocial("email", { email: EMAIL });
    });

    expect(useWalletStore.getState().walletAddress).toBe(EMAIL_ADDRESS);
    // Wallet-scoped data for the previous wallet is gone…
    expect(
      queryClient.getQueryData(["membership", MANUAL_ADDRESS, "guild_abc"]),
    ).toBeUndefined();
    // …while guild-scoped data survives the switch.
    expect(queryClient.getQueryData(["guild", "guild_abc"])).toBeDefined();
  });

  it("disconnect revokes the embedded provider session", async () => {
    const logoutSpy = vi.spyOn(localEmbeddedWalletProvider, "logout");
    const wallet = renderUseWallet();
    await act(async () => {
      await wallet.current.connectWithSocial("email", { email: EMAIL });
    });

    act(() => {
      wallet.current.disconnect();
    });

    expect(logoutSpy).toHaveBeenCalled();
    expect(useWalletStore.getState().isConnected).toBe(false);
  });
});
