import { describe, it, expect, vi, beforeEach } from "vitest";
import { onlineManager } from "@tanstack/react-query";
import {
  initConnectivityService,
  useNetworkStore,
  resetConnectivityServiceForTest,
} from "../src/features/network/connectivityService";

const { mockNetInfo, listeners } = vi.hoisted(() => {
  const listeners = new Set<(state: any) => void>();
  const mockNetInfo = {
    addEventListener: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    fetch: vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  };
  return { mockNetInfo, listeners };
});

vi.mock("@react-native-community/netinfo", () => ({
  default: mockNetInfo,
}));

describe("ConnectivityService", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
    resetConnectivityServiceForTest();
    useNetworkStore.setState({ isOnline: true, isOffline: false });
  });

  it("should initialize and register event listener", async () => {
    initConnectivityService();

    expect(mockNetInfo.addEventListener).toHaveBeenCalled();
    expect(mockNetInfo.fetch).toHaveBeenCalled();
  });

  it("should update store and onlineManager when offline", async () => {
    initConnectivityService();

    // Simulating offline event
    const offlineState = { isConnected: false, isInternetReachable: false };
    const listener = mockNetInfo.addEventListener.mock.calls[0][0];

    await listener(offlineState);

    expect(useNetworkStore.getState().isOnline).toBe(false);
    expect(useNetworkStore.getState().isOffline).toBe(true);
    expect(onlineManager.isOnline()).toBe(false);
  });

  it("should update store and onlineManager when online", async () => {
    initConnectivityService();

    const listener = mockNetInfo.addEventListener.mock.calls[0][0];

    // Switch to offline first
    await listener({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    // Switch back to online
    await listener({ isConnected: true, isInternetReachable: true });

    expect(useNetworkStore.getState().isOnline).toBe(true);
    expect(useNetworkStore.getState().isOffline).toBe(false);
    expect(onlineManager.isOnline()).toBe(true);
  });
});
