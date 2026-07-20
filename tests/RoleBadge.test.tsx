import React from "react";
import TestRenderer from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { RoleBadge } from "../src/components/RoleBadge";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
}));

describe("RoleBadge Component", () => {
  it("renders the role name with an accessible label and default tier styling", () => {
    const renderer = TestRenderer.create(<RoleBadge name="Moderator" />);
    const root = renderer.root;

    const container = root.findByProps({ accessibilityLabel: "Role: Moderator" });
    expect(container).toBeDefined();
    expect(container.props.className).toContain("bg-primary/10");

    const label = root.findAllByType("Text").find((node) => node.props.children === "Moderator");
    expect(label).toBeDefined();
    expect(label?.props.className).toContain("text-primary");
  });

  it("applies premium tier styling and hides the decorative icon from screen readers", () => {
    const renderer = TestRenderer.create(<RoleBadge name="VIP" tier="premium" />);
    const root = renderer.root;

    const container = root.findByProps({ accessibilityLabel: "Role: VIP" });
    expect(container.props.className).toContain("bg-success/10");

    const icon = root.findAllByType("Text").find((node) => node.props.accessibilityElementsHidden === true);
    expect(icon).toBeDefined();
    expect(icon?.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("applies restricted tier styling", () => {
    const renderer = TestRenderer.create(<RoleBadge name="Banned" tier="restricted" />);
    const root = renderer.root;

    const container = root.findByProps({ accessibilityLabel: "Role: Banned" });
    expect(container.props.className).toContain("bg-error/10");
  });
});
