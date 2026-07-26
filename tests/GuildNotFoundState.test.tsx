import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { GuildNotFoundState } from "../src/components/GuildNotFoundState";

const mockReplace = vi.fn();

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

describe("GuildNotFoundState Component", () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  it("renders the not-found state with correct testID and copy", () => {
    const renderer = TestRenderer.create(<GuildNotFoundState />);

    const container = renderer.root.findByProps({ testID: "guild-not-found-state" });
    expect(container).toBeDefined();

    const titleText = renderer.root
      .findAllByType("Text")
      .find((node) => node.props.children === "Guild Not Found");
    expect(titleText).toBeDefined();

    const descriptionText = renderer.root
      .findAllByType("Text")
      .find(
        (node) =>
          typeof node.props.children === "string" && node.props.children.includes("doesn't exist"),
      );
    expect(descriptionText).toBeDefined();
  });

  it("renders a Browse Guilds button that navigates to /guilds", () => {
    const renderer = TestRenderer.create(<GuildNotFoundState />);

    const ctaButton = renderer.root.findByProps({ testID: "browse-guilds-button" });
    expect(ctaButton).toBeDefined();
    expect(ctaButton.props.title).toBe("Browse Guilds");

    act(() => {
      ctaButton.props.onPress();
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/guilds");
  });
});
