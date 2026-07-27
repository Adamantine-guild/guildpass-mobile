import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AccessHistoryList } from "../src/components/AccessHistoryList";
import type { AccessHistoryEntry } from "../src/features/access/accessHistory.store";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TouchableOpacity: "TouchableOpacity",
  Platform: { OS: "ios", select: (objs: Record<string, unknown>) => objs.ios ?? objs.default },
  DeviceEventEmitter: {
    addListener: vi.fn(() => ({ remove: vi.fn() })),
    removeListener: vi.fn(),
    emit: vi.fn(),
  },
  NativeModules: {},
  NativeEventEmitter: vi.fn(() => ({
    addListener: vi.fn(() => ({ remove: vi.fn() })),
    removeListener: vi.fn(),
  })),
  Linking: {
    openURL: vi.fn(),
    canOpenURL: vi.fn(),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

vi.mock("../src/features/guilds/useGuildName", () => ({
  useResolvedGuildName: (guildId: string) => (guildId === "guild-alpha" ? "Guild Alpha" : guildId),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return TestRenderer.create(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const entry: AccessHistoryEntry = {
  id: "entry-1",
  guildId: "guild-alpha",
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
    const renderer = renderWithClient(<AccessHistoryList entries={[entry]} onClear={vi.fn()} />);

    const heading = renderer.root.findByProps({
      className: "text-lg font-bold text-text mb-3",
    });

    const output = JSON.stringify(renderer.toJSON());

    expect(heading.children!.join("")).toBe("Recent Access Checks (1)");
    expect(output).toContain("Clear");
    expect(output).toContain("Show");
    expect(output).not.toContain("VIP Door");
  });

  it("expands to show entry details and collapses again", () => {
    const renderer = renderWithClient(<AccessHistoryList entries={[entry]} onClear={vi.fn()} />);

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
    const renderer = renderWithClient(<AccessHistoryList entries={[entry]} onClear={onClear} />);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Clear History" }).props.onPress();
    });

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when expanded", () => {
    const renderer = renderWithClient(<AccessHistoryList entries={[]} onClear={vi.fn()} />);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Expand access history" }).props.onPress();
    });

    expect(JSON.stringify(renderer.toJSON())).toContain("No recent access checks.");
  });

  it("does not render sensitive values when expanded", () => {
    const renderer = renderWithClient(<AccessHistoryList entries={[entry]} onClear={vi.fn()} />);

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
