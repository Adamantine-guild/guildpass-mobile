import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { View } from "react-native";
import Onboarding from "../app/onboarding";

const mockRouter = { push: vi.fn(), replace: vi.fn() };

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  SafeAreaView: "SafeAreaView",
  TouchableOpacity: "TouchableOpacity",
}));

vi.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("../src/features/wallet/EmbeddedWalletOnboarding", () => ({
  EmbeddedWalletOnboarding: () => <View testID="embedded-wallet-onboarding" />,
}));

vi.mock("../src/features/wallet/EmbeddedWalletProvider", () => ({
  isEmbeddedWalletEnabled: false,
}));

describe("Onboarding", () => {
  it("renders the device-loss attestation warning", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Onboarding />);
    });

    expect(
      renderer!.root.findByProps({ testID: "onboarding-attestation-warning" }).children.join(""),
    ).toContain("stored only on this device");
  });
});