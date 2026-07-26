import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { EmptyMembershipsState } from "../src/components/EmptyMembershipsState";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
}));

describe("EmptyMembershipsState Component", () => {
  it("renders the empty state copy and accessible text correctly", () => {
    const onConnectDifferentWallet = vi.fn();
    const renderer = TestRenderer.create(
      <EmptyMembershipsState onConnectDifferentWallet={onConnectDifferentWallet} />,
    );

    const root = renderer.root;
    const container = root.findByProps({ testID: "empty-memberships-state" });
    expect(container).toBeDefined();

    const titleText = root
      .findAllByType("Text")
      .find((node) => node.props.children === "No Memberships Found");
    expect(titleText).toBeDefined();

    const ctaButton = root.findByProps({ testID: "connect-different-wallet-button" });
    expect(ctaButton).toBeDefined();
    expect(ctaButton.props.title).toBe("Connect a different wallet");
  });

  it("calls the CTA callback onConnectDifferentWallet when pressed", () => {
    const onConnectDifferentWallet = vi.fn();
    const renderer = TestRenderer.create(
      <EmptyMembershipsState onConnectDifferentWallet={onConnectDifferentWallet} />,
    );

    const root = renderer.root;
    const ctaButton = root.findByProps({ testID: "connect-different-wallet-button" });

    act(() => {
      ctaButton.props.onPress();
    });

    expect(onConnectDifferentWallet).toHaveBeenCalledTimes(1);
  });
});
