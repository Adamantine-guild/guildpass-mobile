import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage before importing the store
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem: vi.fn(),
    getItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import { useNotificationsStore } from "../src/features/notifications/notifications.store";
import { NotificationsAdapter } from "../src/features/notifications/notifications.adapter";

describe("Notifications Store", () => {
  beforeEach(() => {
    useNotificationsStore.setState({
      pushToken: null,
      permissionStatus: "undetermined",
      preferences: {
        role_changes: true,
        access_grants: true,
        membership_updates: true,
      },
      isRegistering: false,
      error: null,
    });
  });

  it("should update push token", () => {
    useNotificationsStore.getState().setPushToken("test-token");
    expect(useNotificationsStore.getState().pushToken).toBe("test-token");
  });

  it("should update permission status", () => {
    useNotificationsStore.getState().setPermissionStatus("granted");
    expect(useNotificationsStore.getState().permissionStatus).toBe("granted");
  });

  it("should toggle preferences and sync with adapter if wallet is provided", async () => {
    const mockAdapter: NotificationsAdapter = {
      registerToken: vi.fn().mockResolvedValue(undefined),
      updatePreferences: vi.fn().mockResolvedValue(undefined),
    };
    useNotificationsStore.getState().setAdapter(mockAdapter);

    await useNotificationsStore.getState().togglePreference("role_changes", "0x123");

    expect(useNotificationsStore.getState().preferences.role_changes).toBe(false);
    expect(mockAdapter.updatePreferences).toHaveBeenCalledWith("0x123", {
      role_changes: false,
      access_grants: true,
      membership_updates: true,
    });

    await useNotificationsStore.getState().togglePreference("role_changes", "0x123");
    expect(useNotificationsStore.getState().preferences.role_changes).toBe(true);
  });

  it("should call adapter registerToken when registerToken is called", async () => {
    const mockAdapter: NotificationsAdapter = {
      registerToken: vi.fn().mockResolvedValue(undefined),
      updatePreferences: vi.fn().mockResolvedValue(undefined),
    };

    useNotificationsStore.getState().setAdapter(mockAdapter);
    useNotificationsStore.getState().setPushToken("test-token");

    await useNotificationsStore.getState().registerToken("0x123");

    expect(mockAdapter.registerToken).toHaveBeenCalledWith("0x123", "test-token");
    expect(useNotificationsStore.getState().isRegistering).toBe(false);
    expect(useNotificationsStore.getState().error).toBe(null);
  });

  it("should handle registration failure", async () => {
    const mockAdapter: NotificationsAdapter = {
      registerToken: vi.fn().mockRejectedValue(new Error("Network error")),
      updatePreferences: vi.fn().mockResolvedValue(undefined),
    };

    useNotificationsStore.getState().setAdapter(mockAdapter);
    useNotificationsStore.getState().setPushToken("test-token");

    await useNotificationsStore.getState().registerToken("0x123");

    expect(useNotificationsStore.getState().error).toBe("Network error");
    expect(useNotificationsStore.getState().isRegistering).toBe(false);
  });

  it("should not call adapter if pushToken is missing", async () => {
    const mockAdapter: NotificationsAdapter = {
      registerToken: vi.fn().mockResolvedValue(undefined),
      updatePreferences: vi.fn().mockResolvedValue(undefined),
    };

    useNotificationsStore.getState().setAdapter(mockAdapter);
    await useNotificationsStore.getState().registerToken("0x123");

    expect(mockAdapter.registerToken).not.toHaveBeenCalled();
  });
});
