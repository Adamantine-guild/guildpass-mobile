import React from "react";
import TestRenderer from "react-test-renderer";
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
    const renderer = TestRenderer.create(<Onboarding />);

    expect(JSON.stringify(renderer.toJSON())).toContain("stored only on this device");
  });
});
