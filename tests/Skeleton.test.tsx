import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { Skeleton } from "../src/components/Skeleton";

vi.mock("react-native", () => {
  function AnimatedValue(_value: number) {}
  return {
    Animated: {
      View: "Animated.View",
      Value: AnimatedValue,
      timing: () => ({ start: (cb?: () => void) => cb?.() }),
      sequence: () => ({ start: (cb?: () => void) => cb?.() }),
      loop: () => ({ start: () => {}, stop: () => {} }),
    },
  };
});

describe("Skeleton", () => {
  it("hides the decorative shimmer block from assistive technology", () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<Skeleton className="h-4 w-24" />);
    });

    const node = renderer!.root.findByType("Animated.View" as never);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("applies the supplied className alongside the base skeleton style", () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<Skeleton className="h-4 w-24" />);
    });

    const node = renderer!.root.findByType("Animated.View" as never);
    expect(node.props.className).toContain("h-4 w-24");
    expect(node.props.className).toContain("bg-border");
  });
});
