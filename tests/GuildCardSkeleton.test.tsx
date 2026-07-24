import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { GuildCardSkeleton, GuildListSkeleton } from "../src/components/GuildCardSkeleton";

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

describe("GuildCardSkeleton", () => {
  it("renders a shimmer block for each part of the real GuildCard layout", () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<GuildCardSkeleton />);
    });

    const blocks = renderer!.root.findAllByType("Animated.View" as never);
    // title, status pill, id line, role pill, "tap to view" line
    expect(blocks.length).toBe(5);
  });
});

describe("GuildListSkeleton", () => {
  it("defaults to 5 placeholder cards", () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<GuildListSkeleton />);
    });

    const container = renderer!.root.findByProps({ testID: "guild-list-skeleton" });
    expect(container).toBeDefined();
    const blocks = renderer!.root.findAllByType("Animated.View" as never);
    expect(blocks.length).toBe(5 * 5);
  });

  it("renders the requested number of placeholder cards", () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<GuildListSkeleton count={2} />);
    });

    const blocks = renderer!.root.findAllByType("Animated.View" as never);
    expect(blocks.length).toBe(2 * 5);
  });

  it("announces the loading state once at the container level", () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<GuildListSkeleton />);
    });

    const container = renderer!.root.findByProps({ testID: "guild-list-skeleton" });
    expect(container.props.accessibilityRole).toBe("progressbar");
    expect(container.props.accessibilityLabel).toBe("Loading memberships");
    expect(container.props.accessibilityLiveRegion).toBe("polite");
  });
});
