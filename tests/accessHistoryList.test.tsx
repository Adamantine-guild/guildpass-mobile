import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AccessHistoryList } from "../src/components/AccessHistoryList";
import type { AccessHistoryEntry } from "../src/features/access/accessHistory.store";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TouchableOpacity: "TouchableOpacity",
}));

const entry: AccessHistoryEntry = {
  id: "entry-1",
  guildId: "guild-alpha",
  guildName: "Guild Alpha",
  resourceId: "vip-door",
  resourceName: "VIP Door",
  status: "denied",
  reason: "Wallet does not hold any required roles.",
  checkedAt: "2026-06-28T10:00:00.000Z",
  matchedRoles: [],
  requiredRoles: ["Member"],
};

describe("AccessHistoryList", () => {
  it("renders the header and count while collapsed", () => {
    const renderer = TestRenderer.create(<AccessHistoryList entries={[entry]} onClear={vi.fn()} />);

    const heading = renderer.root.findByProps({
      className: "text-lg font-bold text-text mb-3",
    });

    const output = JSON.stringify(renderer.toJSON());

    expect(heading.children.join("")).toBe("Recent Access Checks (1)");
    expect(output).toContain("Clear");
    expect(output).toContain("Show");
    expect(output).not.toContain("VIP Door");
  });

  it("expands to show entry details and collapses again", () => {
    const renderer = TestRenderer.create(<AccessHistoryList entries={[entry]} onClear={vi.fn()} />);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Expand access history" }).props.onPress();
    });

    let output = JSON.stringify(renderer.toJSON());
    expect(output).toContain("VIP Door");
    expect(output).toContain("Guild Alpha");
    expect(output).toContain("Denied");
    expect(output).toContain("Wallet does not hold any required roles.");
    expect(output).toContain("Hide");

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Collapse access history" }).props.onPress();
    });

    output = JSON.stringify(renderer.toJSON());
    expect(output).not.toContain("VIP Door");
  });

  it("calls onClear exactly once", () => {
    const onClear = vi.fn();
    const renderer = TestRenderer.create(<AccessHistoryList entries={[entry]} onClear={onClear} />);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Clear History" }).props.onPress();
    });

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when expanded", () => {
    const renderer = TestRenderer.create(<AccessHistoryList entries={[]} onClear={vi.fn()} />);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Expand access history" }).props.onPress();
    });

    expect(JSON.stringify(renderer.toJSON())).toContain("No recent access checks.");
  });

  it("does not render sensitive values when expanded", () => {
    const renderer = TestRenderer.create(<AccessHistoryList entries={[entry]} onClear={vi.fn()} />);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Expand access history" }).props.onPress();
    });

    const output = JSON.stringify(renderer.toJSON());

    expect(output).toContain("VIP Door");
    expect(output).toContain("Guild Alpha");
    expect(output).toContain("Wallet does not hold any required roles.");
    expect(output).not.toMatch(/authorization/i);
    expect(output).not.toMatch(/bearer/i);
    expect(output).not.toMatch(/secret-token/i);
  });
});
