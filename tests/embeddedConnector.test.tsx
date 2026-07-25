/**
 * Embedded wallet behind the WalletConnector interface (Issue #226).
 *
 * `connectEmbeddedWallet` previously validated and wrote to the wallet store on
 * its own, bypassing the connector interface that manual and WalletConnect
 * connections both go through. It now builds an embedded connector and takes the
 * same path. These tests pin that the observable outcome is unchanged.
 */

import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmbeddedConnector } from "../src/features/wallet/walletConnector.service";
import { useWallet } from "../src/features/wallet/useWallet";
import { useWalletStore } from "../src/features/wallet/wallet.store";

const MIXED_CASE_ADDRESS = "0xAbC0000000000000000000000000000000000001";
const LOWERCASE_ADDRESS = MIXED_CASE_ADDRESS.toLowerCase();

let renderer: ReactTestRenderer | null = null;

function mountWallet(): ReturnType<typeof useWallet> {
  let surface: ReturnType<typeof useWallet> | null = null;

  const Probe = () => {
    surface = useWallet();
    return null;
  };

  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });

  return surface!;
}

beforeEach(() => {
  useWalletStore.setState({
    walletAddress: null,
    isConnected: false,
    connectionKind: null,
    _hasHydrated: true,
  });
});

afterEach(() => {
  act(() => {
    renderer?.unmount();
  });
  renderer = null;
});

describe("createEmbeddedConnector", () => {
  it("satisfies the WalletConnector interface with the provisioned address", async () => {
    const connector = createEmbeddedConnector(LOWERCASE_ADDRESS);

    expect(connector.type).toBe("embedded");
    await expect(connector.connect()).resolves.toEqual([LOWERCASE_ADDRESS]);
    await expect(connector.reconnect()).resolves.toEqual([LOWERCASE_ADDRESS]);
    await expect(connector.getAccounts()).resolves.toEqual([LOWERCASE_ADDRESS]);
    await expect(connector.disconnect()).resolves.toBeUndefined();
  });
});

describe("connectEmbeddedWallet", () => {
  it("stores the normalized address under the embedded connection kind", async () => {
    const wallet = mountWallet();

    let result: { success: boolean; error?: string } | undefined;
    await act(async () => {
      result = await wallet.connectEmbeddedWallet(MIXED_CASE_ADDRESS);
    });

    expect(result).toEqual({ success: true });

    const state = useWalletStore.getState();
    expect(state.walletAddress).toBe(LOWERCASE_ADDRESS);
    expect(state.isConnected).toBe(true);
    expect(state.connectionKind).toBe("embedded");
  });

  it("rejects a malformed address and leaves the store untouched", async () => {
    const wallet = mountWallet();

    let result: { success: boolean; error?: string } | undefined;
    await act(async () => {
      result = await wallet.connectEmbeddedWallet("0xBAD");
    });

    expect(result?.success).toBe(false);
    expect(result?.error).toBeTruthy();

    const state = useWalletStore.getState();
    expect(state.walletAddress).toBeNull();
    expect(state.isConnected).toBe(false);
    expect(state.connectionKind).toBeNull();
  });

  it("rejects an empty address and leaves the store untouched", async () => {
    const wallet = mountWallet();

    let result: { success: boolean; error?: string } | undefined;
    await act(async () => {
      result = await wallet.connectEmbeddedWallet("");
    });

    expect(result?.success).toBe(false);
    expect(useWalletStore.getState().walletAddress).toBeNull();
  });

  it("produces the same store state as connecting through the connector directly", async () => {
    const wallet = mountWallet();

    await act(async () => {
      await wallet.connectEmbeddedWallet(MIXED_CASE_ADDRESS);
    });
    const viaEmbeddedHelper = { ...useWalletStore.getState() };

    useWalletStore.setState({
      walletAddress: null,
      isConnected: false,
      connectionKind: null,
    });

    await act(async () => {
      await wallet.connectWithConnector(createEmbeddedConnector(MIXED_CASE_ADDRESS));
    });
    const viaConnector = useWalletStore.getState();

    expect(viaConnector.walletAddress).toBe(viaEmbeddedHelper.walletAddress);
    expect(viaConnector.isConnected).toBe(viaEmbeddedHelper.isConnected);
    expect(viaConnector.connectionKind).toBe(viaEmbeddedHelper.connectionKind);
  });
});
