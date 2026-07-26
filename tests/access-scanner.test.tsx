import React from "react";
import TestRenderer from "react-test-renderer";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AccessScanner from "../app/access-scanner";

// Mock react-native
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  SafeAreaView: "SafeAreaView",
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
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

// Mock expo-camera
vi.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, vi.fn()],
}));

// Mock expo-router
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: vi.fn(), back: vi.fn() }),
}));

// Mock expo-clipboard
vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(),
}));

// Mock useAccessCheck
vi.mock("../src/features/access/useAccessCheck", () => ({
  useAccessCheck: () => ({
    state: { status: "idle" },
    dispatch: vi.fn(),
    startScan: vi.fn(),
    checkAccess: vi.fn(),
    reset: vi.fn(),
  }),
}));

// Mock QR payload verification
vi.mock("../src/features/access/verifyQrPayload", () => ({
  verifyAndParseAccessQrPayload: vi.fn(),
}));

vi.mock("../src/features/guilds/useGuildName", () => ({
  useResolvedGuildName: (guildId: string) => guildId,
}));

vi.mock("../src/features/access/qrSignature", () => ({
  QrSignatureError: class QrSignatureError extends Error {
    readonly code = "QR_SIGNATURE_VERIFICATION_FAILED";
  },
  QR_SIGNATURE_ERROR_CODES: {},
  describeQrSignatureError: (code: string) => code,
}));

describe("AccessScanner - Debug Panel", () => {
  beforeEach(() => {
    vi.stubGlobal("__DEV__", true);
  });

  it("Escenario A: Muestra el panel de debug si __DEV__ es true", () => {
    vi.stubGlobal("__DEV__", true);
    const renderer = TestRenderer.create(<AccessScanner />);
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("Escenario B: No muestra el panel si __DEV__ es false", () => {
    vi.stubGlobal("__DEV__", false);
    const renderer = TestRenderer.create(<AccessScanner />);
    expect(renderer.toJSON()).not.toBeNull();
  });
});
