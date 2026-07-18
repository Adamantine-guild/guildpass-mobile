import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESS_DENIED_FIXTURE, ACCESS_GRANTED_FIXTURE } from "./fixtures/access.fixtures";
import AccessCheck from "../app/access-check";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";
import { useNetworkStore } from "../src/features/network/connectivityService";
import { useSessionStore } from "../src/features/session/session.store";

vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: vi.fn(() => () => {}),
    fetch: vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  },
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
}));

const guildPassClientMock = vi.hoisted(() => ({
  checkAccess: vi.fn(),
}));

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  SafeAreaView: "SafeAreaView",
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  },
}));

vi.mock("../src/lib/guildpassClient", () => ({
  guildPassClient: {
    access: {
      checkAccess: guildPassClientMock.checkAccess,
    },
  },
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://api.guildpass.test", chainId: 1 } } },
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: routerMocks.push, back: routerMocks.back }),
  useLocalSearchParams: () => ({}),
}));

vi.mock("../src/features/wallet/useWallet", () => ({
  useWallet: () => ({
    walletAddress: "0x1234567890123456789012345678901234567890",
    isConnected: true,
  }),
}));

const renderScreen = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return TestRenderer.create(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(AccessCheck),
    ),
  );
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const outputText = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe("AccessCheck screen", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
    guildPassClientMock.checkAccess.mockReset().mockResolvedValue(ACCESS_GRANTED_FIXTURE);
    useAccessHistoryStore.setState({ historyByWallet: {}, hydrated: true });
    useNetworkStore.setState({ isOnline: true, isOffline: false });
    // The access check is bound to the proven session address (matches the
    // mocked useWallet address used by the screen).
    useSessionStore.setState({
      walletAddress: "0x1234567890123456789012345678901234567890",
      status: "authenticated",
    });
  });

  it("clears the previous result when inputs change after a completed check", async () => {
    guildPassClientMock.checkAccess.mockResolvedValueOnce(ACCESS_GRANTED_FIXTURE);

    let screen: ReactTestRenderer;

    await act(async () => {
      screen = renderScreen();
    });

    await act(async () => {
      screen.root
        .findByProps({ testID: "access-check-guild-id-input" })
        .props.onChangeText("guild-alpha");
      screen.root
        .findByProps({ testID: "access-check-resource-id-input" })
        .props.onChangeText("vip-door");
    });

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Check Access" }).props.onPress();
      await flush();
    });

    expect(outputText(screen!)).toContain("Access Granted");

    await act(async () => {
      screen.root
        .findByProps({ testID: "access-check-resource-id-input" })
        .props.onChangeText("members-room");
    });

    expect(outputText(screen!)).not.toContain("Access Granted");
  });

  it("records denied checks in recent history", async () => {
    guildPassClientMock.checkAccess.mockResolvedValueOnce(ACCESS_DENIED_FIXTURE);

    let screen: ReactTestRenderer;

    await act(async () => {
      screen = renderScreen();
    });

    await act(async () => {
      screen.root
        .findByProps({ testID: "access-check-guild-id-input" })
        .props.onChangeText("guild-alpha");
      screen.root
        .findByProps({ testID: "access-check-resource-id-input" })
        .props.onChangeText("vip-door");
    });

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Check Access" }).props.onPress();
      await flush();
    });

    expect(outputText(screen!)).toContain("Access Denied");
    expect(outputText(screen!)).toContain("Recent Access Checks");
    expect(outputText(screen!)).toContain("vip-door");
    expect(outputText(screen!)).toContain("Denied");
  });

  it("renders the offline banner and disables the check button when offline", async () => {
    useNetworkStore.setState({ isOnline: false, isOffline: true });

    let screen: ReactTestRenderer;

    await act(async () => {
      screen = renderScreen();
    });

    const screenText = outputText(screen!);
    expect(screenText).toContain("You are offline. This access result may be outdated");

    const checkButton = screen!.root.findByProps({ accessibilityLabel: "Check Access" });
    expect(checkButton.props.disabled).toBe(true);
  });
});
