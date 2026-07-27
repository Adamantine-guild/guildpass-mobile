/**
 * Tests for the CustodyDisclosure component.
 *
 * Verifies that the custody trade-off information renders correctly,
 * that the expand/collapse interaction works, and that the learn-more
 * link points to the right URL.
 */

import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustodyDisclosure } from "../src/features/wallet/CustodyDisclosure";

// Mock Linking.openURL so we can verify the learn-more link
const mockOpenURL = vi.fn();
vi.mock("react-native", async () => {
  const actual = await vi.importActual<typeof import("react-native")>("react-native");
  return {
    ...actual,
    Linking: {
      ...actual.Linking,
      openURL: (...args: unknown[]) => mockOpenURL(...args),
    },
  };
});

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => {
    renderer?.unmount();
  });
  renderer = null;
  mockOpenURL.mockReset();
});

describe("CustodyDisclosure", () => {
  it("renders the summary text", () => {
    act(() => {
      renderer = TestRenderer.create(<CustodyDisclosure />);
    });

    const root = renderer!.root;
    const disclosure = root.findByProps({ testID: "custody-disclosure" });
    expect(disclosure).toBeTruthy();

    // Summary should always be visible
    const summaryTexts = root.findAllByType("Text" as any);
    const hasAboutText = summaryTexts.some(
      (node) =>
        typeof node.props.children === "string" &&
        node.props.children.includes("About your embedded wallet"),
    );
    expect(hasAboutText).toBe(true);
  });

  it("does not show details by default", () => {
    act(() => {
      renderer = TestRenderer.create(<CustodyDisclosure />);
    });

    const root = renderer!.root;
    const detailNodes = root.findAllByProps({ testID: "custody-disclosure-details" });
    expect(detailNodes).toHaveLength(0);
  });

  it("shows details when the toggle is tapped", () => {
    act(() => {
      renderer = TestRenderer.create(<CustodyDisclosure />);
    });

    const root = renderer!.root;
    const toggle = root.findByProps({ testID: "custody-disclosure-toggle" });

    act(() => {
      toggle.props.onPress();
    });

    const details = root.findByProps({ testID: "custody-disclosure-details" });
    expect(details).toBeTruthy();

    // Check key content sections are present
    const detailTexts = details.findAllByType("Text" as any);
    const textContents = detailTexts
      .map((n) => n.props.children)
      .flat()
      .filter((c): c is string => typeof c === "string");

    expect(textContents.some((t) => t.includes("How your keys are secured"))).toBe(true);
    expect(textContents.some((t) => t.includes("Recovery"))).toBe(true);
    expect(textContents.some((t) => t.includes("Trade-offs vs. self-custody"))).toBe(true);
    expect(textContents.some((t) => t.includes("Interoperability"))).toBe(true);
  });

  it("hides details when the toggle is tapped again", () => {
    act(() => {
      renderer = TestRenderer.create(<CustodyDisclosure />);
    });

    const root = renderer!.root;
    const toggle = root.findByProps({ testID: "custody-disclosure-toggle" });

    // Expand
    act(() => {
      toggle.props.onPress();
    });
    expect(root.findAllByProps({ testID: "custody-disclosure-details" })).toHaveLength(1);

    // Collapse
    act(() => {
      toggle.props.onPress();
    });
    expect(root.findAllByProps({ testID: "custody-disclosure-details" })).toHaveLength(0);
  });

  it("has a learn-more link with the correct URL", () => {
    act(() => {
      renderer = TestRenderer.create(<CustodyDisclosure />);
    });

    const root = renderer!.root;
    const toggle = root.findByProps({ testID: "custody-disclosure-toggle" });

    // Expand to reveal the link
    act(() => {
      toggle.props.onPress();
    });

    const learnMore = root.findByProps({ testID: "custody-disclosure-learn-more" });
    expect(learnMore).toBeTruthy();

    // Simulate press
    act(() => {
      learnMore.props.onPress();
    });

    expect(mockOpenURL).toHaveBeenCalledWith("https://docs.privy.io/guide/security");
  });

  it("accepts a custom testID", () => {
    act(() => {
      renderer = TestRenderer.create(<CustodyDisclosure testID="custom-id" />);
    });

    const root = renderer!.root;
    expect(root.findByProps({ testID: "custom-id" })).toBeTruthy();
  });
});
