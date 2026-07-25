import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { AccessStatusCardSkeleton } from "../src/components/AccessStatusCardSkeleton";

vi.mock("react-native", () => {
  function AnimatedValue(_value: number) {}
  return {
    View: "View",
    Animated: {
      View: "Animated.View",
      Value: AnimatedValue,
      timing: () => ({ start: (cb?: () => void) => cb?.() }),
      sequence: () => ({ start: (cb?: () => void) => cb?.() }),
      loop: () => ({ start: () => {}, stop: () => {} }),
    },
  };
});

describe("AccessStatusCardSkeleton", () => {
  it("renders with the expected testID and announces the loading state", () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<AccessStatusCardSkeleton />);
    });

    const container = renderer!.root.findByProps({ testID: "access-status-skeleton" });
    expect(container.props.accessibilityRole).toBe("progressbar");
    expect(container.props.accessibilityLabel).toBe("Checking protocol permissions");
    expect(container.props.accessibilityLiveRegion).toBe("polite");
  });

  it("mirrors the AccessStatusCard shape: icon, title, subtitle, and a requirements row", () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<AccessStatusCardSkeleton />);
    });

    const blocks = renderer!.root.findAllByType("Animated.View" as never);
    // icon circle, title, subtitle, requirements label, 2 requirement pills
    expect(blocks.length).toBe(6);
  });
});
