import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESS_DENIED_FIXTURE, ACCESS_GRANTED_FIXTURE } from "./fixtures/access.fixtures";
import AccessCheck from "../app/access-check";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";
import { useNetworkStore } from "../src/features/network/connectivityService";

vi.hoisted(() => {
  Object.defineProperty(globalThis, "__DEV__", {
    value: false,
    writable: true,
    configurable: true,
  });
});

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

const guildQueryMock = vi.hoisted(() => ({
  data: { name: "Guild Alpha" } as { name: string } | undefined,
}));

const searchParams = vi.hoisted(() => ({ qrPayload: undefined as string | undefined }));

const walletState = vi.hoisted(() => ({
  walletAddress: "0x1234567890123456789012345678901234567890",
  isConnected: true,
}));

const biometricAuthMocks = vi.hoisted(() => ({
  hasHardwareAsync: vi.fn(),
  isEnrolledAsync: vi.fn(),
  authenticateAsync: vi.fn(),
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  SafeAreaView: "SafeAreaView",
  Platform: {
    OS: "ios",
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  DeviceEventEmitter: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
  NativeModules: {},
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
  useLocalSearchParams: () => searchParams,
}));

vi.mock("../src/features/wallet/useWallet", () => ({
  useWallet: () => walletState,
}));

vi.mock("../src/features/guilds/useGuilds", () => ({
  useGuilds: () => ({
    useGuild: () => ({
      data: guildQueryMock.data,
    }),
  }),
}));

vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: biometricAuthMocks.hasHardwareAsync,
  isEnrolledAsync: biometricAuthMocks.isEnrolledAsync,
  authenticateAsync: biometricAuthMocks.authenticateAsync,
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
    searchParams.qrPayload = undefined;
    walletState.walletAddress = "0x1234567890123456789012345678901234567890";
    walletState.isConnected = true;
    vi.clearAllMocks();
    biometricAuthMocks.hasHardwareAsync.mockReset().mockResolvedValue(true);
    biometricAuthMocks.isEnrolledAsync.mockReset().mockResolvedValue(true);
    biometricAuthMocks.authenticateAsync.mockReset().mockResolvedValue({ success: true });
    guildPassClientMock.checkAccess.mockReset().mockResolvedValue(ACCESS_GRANTED_FIXTURE);
    guildQueryMock.data = { name: "Guild Alpha" };
    useAccessHistoryStore.setState({ entries: [] });
    useNetworkStore.setState({ isOnline: true, isOffline: false });
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
      await flush();
    });

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Check Access" }).props.onPress();
      await flush();
    });

    const entry = useAccessHistoryStore.getState().entries[0];
    expect(outputText(screen!)).toContain("Access Denied");
    expect(entry).toMatchObject({
      guildId: "guild-alpha",
      guildName: "Guild Alpha",
      resourceId: "vip-door",
      resourceName: "vip-door",
      status: "denied",
    });
  });

  it("uses the guild ID as fallback when the guild-name lookup fails", async () => {
    guildPassClientMock.checkAccess.mockResolvedValueOnce(ACCESS_GRANTED_FIXTURE);
    guildQueryMock.data = undefined;

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
      await flush();
    });

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Check Access" }).props.onPress();
      await flush();
    });

    const entry = useAccessHistoryStore.getState().entries[0];
    expect(entry).toMatchObject({
      guildId: "guild-alpha",
      guildName: "guild-alpha",
      resourceId: "vip-door",
      resourceName: "vip-door",
    });
  });

  it("does not show a wallet warning when the QR payload matches the connected wallet", async () => {
    searchParams.qrPayload = JSON.stringify({
      type: "guildpass.access-check",
      version: 1,
      guildId: "guild-alpha",
      resourceId: "vip-door",
      walletAddress: walletState.walletAddress,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    let screen: ReactTestRenderer;

    await act(async () => {
      screen = renderScreen();
      await flush();
    });

    expect(outputText(screen!)).not.toContain("This QR payload uses a different wallet address");
  });

  it("shows a warning and allows switching back to the connected wallet when the QR wallet differs", async () => {
    searchParams.qrPayload = JSON.stringify({
      type: "guildpass.access-check",
      version: 1,
      guildId: "guild-alpha",
      resourceId: "vip-door",
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    let screen: ReactTestRenderer;

    await act(async () => {
      screen = renderScreen();
      await flush();
    });

    expect(outputText(screen!)).toContain("This QR payload uses a different wallet address");

    await act(async () => {
      screen!.root.findByProps({ accessibilityLabel: "Use connected wallet" }).props.onPress();
    });

    expect(screen!.root.findByProps({ testID: "access-check-wallet-input" }).props.value).toBe(
      walletState.walletAddress,
    );
    expect(outputText(screen!)).not.toContain("This QR payload uses a different wallet address");
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
