import { vi } from "vitest";

// Define __DEV__ for React Native/Expo modules in node test environment
(global as any).__DEV__ = true;

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

// Mock SecureStore while preserving its production key/value constraints.
vi.mock("expo-secure-store", () => {
  const validateKey = (key: string) => {
    if (!/^[\w.-]+$/.test(key)) throw new Error(`Invalid SecureStore key: ${key}`);
  };
  return {
    getItemAsync: vi.fn(async (key: string) => {
      validateKey(key);
      return null;
    }),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      validateKey(key);
      if (new TextEncoder().encode(value).length > 2_048) {
        throw new Error(`SecureStore value exceeds 2048 bytes: ${key}`);
      }
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      validateKey(key);
    }),
    WHEN_UNLOCKED: "WHEN_UNLOCKED",
    AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
    ALWAYS: "ALWAYS",
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: "WHEN_PASSCODE_SET_THIS_DEVICE_ONLY",
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
    ALWAYS_THIS_DEVICE_ONLY: "ALWAYS_THIS_DEVICE_ONLY",
  };
});

// Mock expo-clipboard
vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => true),
  getStringAsync: vi.fn(async () => ""),
}));

// Mock expo-sqlite (avoids typeof import issues with Vite/Rollup)
vi.mock("expo-sqlite", () => {
  const noop = () => {
    throw new Error("expo-sqlite is not available in test environment");
  };
  return {
    openDatabase: noop,
    deleteDatabaseAsync: noop,
    default: {
      openDatabase: noop,
      deleteDatabaseAsync: noop,
    },
  };
});
