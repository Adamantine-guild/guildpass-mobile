import React from "react";
import TestRenderer from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { GuildCard } from "../src/components/GuildCard";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
}));

describe("GuildCard", () => {
  it("labels cached revoked passes distinctly while offline", () => {
    const renderer = TestRenderer.create(
      <GuildCard
        name="Alpha Guild"
        id="guild_abc"
        isActive={false}
        roleCount={0}
        status="revoked"
        offlineCached
        onPress={() => {}}
      />,
    );

    const button = renderer.root.findByProps({ accessibilityRole: "button" });
    expect(button.props.accessibilityLabel).toContain("revoked");
    expect(button.props.accessibilityLabel).toContain("cached offline");

    expect(JSON.stringify(renderer.toJSON())).toContain("REVOKED");
    expect(renderer.root.findByProps({ testID: "guild-card-offline-cache" })).toBeDefined();
  });
});
