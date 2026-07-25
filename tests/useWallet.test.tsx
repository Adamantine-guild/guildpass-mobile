/**
 * useWallet subscription granularity (Issue #224).
 *
 * `useWallet` previously called `useWalletStore()` with no selector, so every
 * `set()` produced a new state object and re-rendered all eight consumers even
 * when no consumed value had changed. `WalletConnectProvider` re-writes the same
 * address on each run of its bridge effect, which made that a real cost rather
 * than a theoretical one.
 */

import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWallet } from "../src/features/wallet/useWallet";
import { useWalletStore } from "../src/features/wallet/wallet.store";

const ADDRESS = "0xabc0000000000000000000000000000000000001";
const OTHER_ADDRESS = "0xdef0000000000000000000000000000000000002";

const WalletHarness = ({ onRender }: { onRender: () => void }) => {
  useWallet();
  onRender();
  return null;
};

let renderer: ReactTestRenderer | null = null;

function mountHarness(): () => number {
  let renders = 0;
  act(() => {
    renderer = TestRenderer.create(
      <WalletHarness
        onRender={() => {
          renders += 1;
        }}
      />,
    );
  });
  return () => renders;
}

beforeEach(() => {
  useWalletStore.setState({
    walletAddress: ADDRESS,
    isConnected: true,
    connectionKind: "walletconnect",
    _hasHydrated: true,
  });
});

afterEach(() => {
  act(() => {
    renderer?.unmount();
  });
  renderer = null;
});

describe("useWallet subscriptions", () => {
  it("does not re-render when a store write leaves every selected value unchanged", () => {
    const renders = mountHarness();
    const before = renders();

    act(() => {
      useWalletStore.getState().setWalletAddress(ADDRESS, "walletconnect");
    });

    expect(renders()).toBe(before);
  });

  it("does not re-render when hydration is re-flagged at its current value", () => {
    const renders = mountHarness();
    const before = renders();

    act(() => {
      useWalletStore.getState().setHasHydrated(true);
    });

    expect(renders()).toBe(before);
  });

  it("re-renders when the wallet address changes", () => {
    const renders = mountHarness();
    const before = renders();

    act(() => {
      useWalletStore.getState().setWalletAddress(OTHER_ADDRESS, "manual");
    });

    expect(renders()).toBeGreaterThan(before);
  });

  it("exposes the same public surface consumers destructure", () => {
    let surface: ReturnType<typeof useWallet> | null = null;
    const Probe = () => {
      surface = useWallet();
      return null;
    };
    act(() => {
      renderer = TestRenderer.create(<Probe />);
    });

    expect(surface).toMatchObject({
      walletAddress: ADDRESS,
      isConnected: true,
      connectionKind: "walletconnect",
      isHydrated: true,
    });
    expect(typeof surface!.connectManually).toBe("function");
    expect(typeof surface!.connectEmbeddedWallet).toBe("function");
    expect(typeof surface!.connectWithConnector).toBe("function");
    expect(typeof surface!.connectWalletConnect).toBe("function");
    expect(typeof surface!.disconnect).toBe("function");
  });
});
