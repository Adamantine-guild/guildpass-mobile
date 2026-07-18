import { vi } from "vitest";

// React Native exposes __DEV__ as a global in app code. The node test environment
// lacks it, so define it for component tests (e.g. accessScanner) that reference it.
if (typeof (globalThis as { __DEV__?: boolean }).__DEV__ === "undefined") {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
}

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    getAllKeys: vi.fn(),
    multiGet: vi.fn(),
    multiSet: vi.fn(),
    multiRemove: vi.fn(),
    multiMerge: vi.fn(),
  },
}));

// Mock SecureStore with an in-memory backing so the refresh-token store (and
// other secure-storage users) actually persist within a test, while the call
// assertions (`toHaveBeenCalledWith`) still work.
const secureStoreMemory = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(secureStoreMemory.get(key) ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    secureStoreMemory.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string) => {
    secureStoreMemory.delete(key);
    return Promise.resolve();
  }),
  WHEN_UNLOCKED: "WHEN_UNLOCKED",
  AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
  ALWAYS: "ALWAYS",
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: "WHEN_PASSCODE_SET_THIS_DEVICE_ONLY",
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
  ALWAYS_THIS_DEVICE_ONLY: "ALWAYS_THIS_DEVICE_ONLY",
}));
