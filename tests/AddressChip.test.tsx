import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AddressChip, truncateAddress } from "../src/components/AddressChip";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
}));

const setStringAsyncMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock("expo-clipboard", () => ({
  setStringAsync: setStringAsyncMock,
}));

const ADDRESS = "0x1234567890123456789012345678901234567890";

beforeEach(() => {
  vi.useFakeTimers();
  setStringAsyncMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("truncateAddress", () => {
  it("truncates a full address to the first 6 and last 4 characters", () => {
    expect(truncateAddress(ADDRESS)).toBe("0x1234…7890");
  });

  it("leaves short strings untouched", () => {
    expect(truncateAddress("0xabc")).toBe("0xabc");
  });
});

describe("AddressChip Component", () => {
  it("renders the truncated address and an accessible copy label", () => {
    const renderer = TestRenderer.create(<AddressChip address={ADDRESS} testID="address-chip" />);
    const root = renderer.root;

    const chip = root.findByType("TouchableOpacity");
    expect(chip.props.testID).toBe("address-chip");
    expect(chip.props.accessibilityLabel).toBe(`Copy wallet address ${ADDRESS}`);

    const truncatedText = root
      .findAllByType("Text")
      .find((node) => node.props.children === "0x1234…7890");
    expect(truncatedText).toBeDefined();
  });

  it("copies the full untruncated address to the clipboard on tap", async () => {
    const renderer = TestRenderer.create(<AddressChip address={ADDRESS} testID="address-chip" />);
    const chip = renderer.root.findByType("TouchableOpacity");

    await act(async () => {
      await chip.props.onPress();
    });

    expect(setStringAsyncMock).toHaveBeenCalledWith(ADDRESS);
  });

  it("shows 'Copied!' feedback after tapping, then reverts after ~2s", async () => {
    const renderer = TestRenderer.create(<AddressChip address={ADDRESS} testID="address-chip" />);
    const chip = renderer.root.findByType("TouchableOpacity");

    await act(async () => {
      await chip.props.onPress();
    });

    expect(chip.props.accessibilityLabel).toBe("Address copied to clipboard");
    let copiedText = renderer.root
      .findAllByType("Text")
      .find((node) => node.props.children === "Copied!");
    expect(copiedText).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    copiedText = renderer.root
      .findAllByType("Text")
      .find((node) => node.props.children === "Copied!");
    expect(copiedText).toBeUndefined();
    expect(chip.props.accessibilityLabel).toBe(`Copy wallet address ${ADDRESS}`);
  });
});
