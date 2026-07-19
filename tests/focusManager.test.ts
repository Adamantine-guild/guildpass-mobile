import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppState, AppStateStatus } from "react-native";
import { QueryClient } from "@tanstack/react-query";
import { appConfig } from "../src/config/appConfig";
import {
  initFocusManager,
  getLastBackgroundTimeForTest,
  setLastBackgroundTimeForTest,
} from "../src/lib/focusManager";

// Mock AppState
const listeners = new Set<(status: AppStateStatus) => void>();
vi.mock("react-native", () => {
  return {
    AppState: {
      addEventListener: vi.fn((event: string, callback: (status: AppStateStatus) => void) => {
        listeners.add(callback);
        return {
          remove: vi.fn(() => {
            listeners.delete(callback);
          }),
        };
      }),
    },
    Platform: {
      OS: "ios",
      select: vi.fn((objs: any) => objs.ios || objs.default),
    },
    DeviceEventEmitter: {
      addListener: vi.fn(() => ({ remove: vi.fn() })),
      emit: vi.fn(),
    },
  };
});

// Mock expo-constants
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: "https://api.guildpass.test",
        chainId: 1,
        foregroundRefetchThresholdMs: 120000,
      },
    },
  },
}));

// Mock react-query focusManager
const { mockSetFocused } = vi.hoisted(() => {
  return {
    mockSetFocused: vi.fn(),
  };
});
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<any>("@tanstack/react-query");
  return {
    ...actual,
    focusManager: {
      ...actual.focusManager,
      setFocused: mockSetFocused,
    },
  };
});

describe("focusManager Integration with AppState", () => {
  let queryClient: QueryClient;
  let invalidateMock: any;
  let cleanup: () => void;

  beforeEach(() => {
    invalidateMock = vi.fn().mockResolvedValue(undefined);
    queryClient = {
      invalidateQueries: invalidateMock,
    } as unknown as QueryClient;

    listeners.clear();
    mockSetFocused.mockClear();
    setLastBackgroundTimeForTest(null);

    cleanup = initFocusManager(queryClient);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const triggerAppStateChange = (status: AppStateStatus) => {
    listeners.forEach((listener) => listener(status));
  };

  it("subscribes to AppState changes on init and removes listener on cleanup", () => {
    expect(AppState.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(listeners.size).toBe(1);

    cleanup();
    expect(listeners.size).toBe(0);
  });

  it("updates TanStack Query focusManager to focused on transitioning to active", () => {
    triggerAppStateChange("active");
    expect(mockSetFocused).toHaveBeenCalledWith(true);
  });

  it("does not trigger query invalidation if app transitions to active but was not previously backgrounded", () => {
    triggerAppStateChange("active");
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("does not trigger query invalidation if background duration is below threshold", () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // Go to background
    triggerAppStateChange("background");
    expect(getLastBackgroundTimeForTest()).toBe(now);

    // Advance time by 1 minute (below 2 minute threshold)
    vi.setSystemTime(now + 60 * 1000);

    // Return to active
    triggerAppStateChange("active");

    expect(invalidateMock).not.toHaveBeenCalled();
    expect(getLastBackgroundTimeForTest()).toBeNull();

    vi.useRealTimers();
  });

  it("invalidates membership and user-roles queries if background duration is above threshold", () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // Go to background
    triggerAppStateChange("background");
    expect(getLastBackgroundTimeForTest()).toBe(now);

    // Advance time by 2 minutes + 1 second (above 2 minute threshold)
    vi.setSystemTime(now + 120 * 1000 + 1000);

    // Return to active
    triggerAppStateChange("active");

    expect(invalidateMock).toHaveBeenCalledTimes(2);
    expect(invalidateMock).toHaveBeenCalledWith({
      queryKey: ["membership"],
      refetchType: "all",
    });
    expect(invalidateMock).toHaveBeenCalledWith({
      queryKey: ["user-roles"],
      refetchType: "all",
    });
    expect(getLastBackgroundTimeForTest()).toBeNull();

    vi.useRealTimers();
  });
});
