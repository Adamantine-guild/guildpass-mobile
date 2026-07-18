/// <reference types="vitest/globals" />
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Text } from "react-native";
import { WalletRequired } from "../src/components/WalletRequired";

const mockIsConnected = vi.fn();
const mockIsHydrated = vi.fn();
const mockReplace = vi.fn();

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
}));

vi.mock("../src/features/wallet/useWallet", () => ({
  useWallet: () => ({
    isConnected: mockIsConnected(),
    isHydrated: mockIsHydrated(),
  }),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

describe("WalletRequired", () => {
  beforeEach(() => {
    mockIsConnected.mockReset().mockReturnValue(true);
    mockIsHydrated.mockReset().mockReturnValue(true);
    mockReplace.mockReset();
  });

  it("renders children when wallet is connected", () => {
    let tree: any;
    act(() => {
      tree = TestRenderer.create(
        <WalletRequired>
          <Text>Protected content</Text>
        </WalletRequired>
      );
    });
    expect(JSON.stringify(tree.toJSON())).toContain("Protected content");
  });

  it("returns null when store is not yet hydrated", () => {
    mockIsConnected.mockReturnValue(false);
    mockIsHydrated.mockReturnValue(false);
    let tree: any;
    act(() => {
      tree = TestRenderer.create(
        <WalletRequired>
          <Text>Protected content</Text>
        </WalletRequired>
      );
    });
    expect(tree.toJSON()).toBeNull();
  });

  it("redirects to /profile when disconnected and redirect=true", () => {
    mockIsConnected.mockReturnValue(false);
    mockIsHydrated.mockReturnValue(true);
    act(() => {
      TestRenderer.create(
        <WalletRequired redirect={true}>
          <Text>Protected content</Text>
        </WalletRequired>
      );
    });
    expect(mockReplace).toHaveBeenCalledWith("/profile");
  });

  it("shows connect-wallet prompt when disconnected and redirect=false", () => {
    mockIsConnected.mockReturnValue(false);
    mockIsHydrated.mockReturnValue(true);
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <WalletRequired redirect={false}>
          <Text>Protected content</Text>
        </WalletRequired>
      );
    });
    expect(renderer.root.findByProps({ testID: "wallet-required-prompt" })).toBeDefined();
    expect(renderer.root.findByProps({ testID: "wallet-required-connect" })).toBeDefined();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
