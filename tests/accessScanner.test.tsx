import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraPermissions } from "expo-camera";
import AccessScanner from "../app/access-scanner";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";

type PermissionResponse = {
  granted: boolean;
  canAskAgain: boolean;
  status: "granted" | "denied";
  expires: "never";
};

const accessibilityInfoMock = vi.hoisted(() => ({
  announceForAccessibility: vi.fn(),
}));

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
  AccessibilityInfo: accessibilityInfoMock,
}));

type MockCameraViewProps = {
  onBarcodeScanned?: (result: { data: string }) => Promise<void>;
};

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
}));

const cameraViewMock = vi.hoisted(() => vi.fn((_props: MockCameraViewProps) => null));
const verifyAndParseAccessQrPayloadMock = vi.hoisted(() => vi.fn());
const QR_SIGNATURE_ERROR_CODES_MOCK = vi.hoisted(() => ({
  MISSING_SIGNATURE: "QR_SIGNATURE_MISSING",
  INVALID_SIGNATURE_FORMAT: "QR_SIGNATURE_FORMAT_INVALID",
  VERIFICATION_FAILED: "QR_SIGNATURE_VERIFICATION_FAILED",
  PUBLIC_KEY_UNAVAILABLE: "QR_SIGNATURE_PUBLIC_KEY_UNAVAILABLE",
  REVOKED_KEY: "QR_KEY_REVOKED",
  UNKNOWN_KEY: "QR_KEY_UNKNOWN",
  MISSING_KID: "QR_KID_MISSING",
  KEY_REGISTRY_EXPIRED: "QR_KEY_REGISTRY_EXPIRED",
}));
const qrSignatureMessagesMock = vi.hoisted(() => ({
  [QR_SIGNATURE_ERROR_CODES_MOCK.REVOKED_KEY]:
    "This QR code was signed with a revoked guild key. Contact the guild admin for a new code.",
  [QR_SIGNATURE_ERROR_CODES_MOCK.KEY_REGISTRY_EXPIRED]:
    "The guild key registry is stale. Reconnect to the internet and scan again.",
  [QR_SIGNATURE_ERROR_CODES_MOCK.INVALID_SIGNATURE_FORMAT]:
    "The QR code signature is malformed. Re-scan the code or ask the guild admin for a fresh one.",
  [QR_SIGNATURE_ERROR_CODES_MOCK.VERIFICATION_FAILED]:
    "The QR code signature could not be verified. Do not use this code; ask the guild admin for a fresh one.",
}));
const describeQrSignatureErrorMock = vi.hoisted(() =>
  vi.fn(
    (code: string) =>
      qrSignatureMessagesMock[code] ??
      qrSignatureMessagesMock[QR_SIGNATURE_ERROR_CODES_MOCK.VERIFICATION_FAILED],
  ),
);
const QrSignatureErrorMock = vi.hoisted(
  () =>
    class QrSignatureError extends Error {
      readonly code: string;

      constructor(
        code = QR_SIGNATURE_ERROR_CODES_MOCK.VERIFICATION_FAILED,
        message = "Invalid QR signature",
      ) {
        super(message);
        this.name = "QrSignatureError";
        this.code = code;
      }
    },
);

const createPermissionResponse = (granted: boolean, canAskAgain: boolean): PermissionResponse =>
  ({
    granted,
    canAskAgain,
    status: granted ? "granted" : "denied",
    expires: "never",
  }) as PermissionResponse;

const mockCameraPermission = (permission: PermissionResponse | null) =>
  vi
    .mocked(useCameraPermissions)
    .mockReturnValue([permission, vi.fn(), vi.fn()] as ReturnType<typeof useCameraPermissions>);

vi.mock("expo-router", () => ({
  useRouter: () => ({
    replace: routerMocks.replace,
    back: routerMocks.back,
  }),
}));

vi.mock("expo-camera", () => ({
  useCameraPermissions: vi.fn(),
  CameraView: cameraViewMock,
}));

vi.mock("../src/features/access/verifyQrPayload", () => ({
  verifyAndParseAccessQrPayload: verifyAndParseAccessQrPayloadMock,
}));

vi.mock("../src/features/guilds/useGuildName", () => ({
  useResolvedGuildName: (guildId: string) => guildId,
}));

vi.mock("../src/features/access/qrSignature", () => ({
  QrSignatureError: QrSignatureErrorMock,
  QR_SIGNATURE_ERROR_CODES: QR_SIGNATURE_ERROR_CODES_MOCK,
  describeQrSignatureError: describeQrSignatureErrorMock,
}));

const screenText = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe("AccessScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAccessHistoryStore.setState({ entries: [] });
    cameraViewMock.mockImplementation(() => null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading state while checking permission", () => {
    mockCameraPermission(null);

    const renderer = TestRenderer.create(<AccessScanner />);

    const output = screenText(renderer);
    expect(output).toContain("Checking camera permission...");
    expect(output).toContain("accessibilityLiveRegion");
  });

  it("shows permission request when camera not granted and can ask again", () => {
    mockCameraPermission(createPermissionResponse(false, true));

    const renderer = TestRenderer.create(<AccessScanner />);

    const output = screenText(renderer);
    expect(output).toContain("Allow Camera Access");
    expect(output).toContain("Camera permission denied");
    expect(output).toContain("accessibilityRole");
  });

  it("shows permanent denial message when camera denied and cannot ask again", () => {
    mockCameraPermission(createPermissionResponse(false, false));

    const renderer = TestRenderer.create(<AccessScanner />);

    expect(screenText(renderer)).toContain(
      "Camera permission was permanently denied. Open Settings to enable camera access for GuildPass to scan QR codes.",
    );
  });

  it("shows scanner view when permission is granted", () => {
    mockCameraPermission(createPermissionResponse(true, true));

    const renderer = TestRenderer.create(<AccessScanner />);

    expect(screenText(renderer)).toContain("Point your camera at a GuildPass access QR code.");
    expect(cameraViewMock.mock.calls.at(-1)?.[0]).toMatchObject({
      accessibilityLabel: "Scanning for GuildPass access QR code",
      accessibilityHint: "Point the camera at a GuildPass QR code to start access verification",
      accessibilityLiveRegion: "polite",
    });
  });

  it("announces processing and success during a valid scan", async () => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock.mockResolvedValue({
      payload: {
        guildId: "guild-alpha",
        resourceId: "vip-door",
        walletAddress: "0xabc",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      isVerified: true
    });

    TestRenderer.create(<AccessScanner />);

    await act(async () => {
      const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

      if (!cameraProps) {
        throw new Error("CameraView did not render");
      }

      await cameraProps.onBarcodeScanned?.({ data: "payload" });
    });

    expect(accessibilityInfoMock.announceForAccessibility).toHaveBeenCalledWith(
      "Processing access QR code.",
    );
    expect(accessibilityInfoMock.announceForAccessibility).toHaveBeenCalledWith(
      "QR code accepted. Opening access check.",
    );
  });

  it("marks scan errors as assertive live-region alerts", async () => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock.mockRejectedValue(new Error("forged"));

    const renderer = TestRenderer.create(<AccessScanner />);

    await act(async () => {
      const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

      if (!cameraProps) {
        throw new Error("CameraView did not render");
      }

      await cameraProps.onBarcodeScanned?.({ data: "payload" });
    });

    const output = screenText(renderer);
    expect(output).toContain("QR code rejected");
    expect(output).toContain("assertive");
    expect(accessibilityInfoMock.announceForAccessibility).toHaveBeenCalledWith(
      "QR code rejected. Unable to read QR payload.",
    );
  });

  it("shows the recent-history section", () => {
    mockCameraPermission(createPermissionResponse(true, true));

    const renderer = TestRenderer.create(<AccessScanner />);

    expect(screenText(renderer)).toContain("Recent Access Checks");
  });

  it("verifies a valid scan and navigates to the access-check screen", async () => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock.mockResolvedValue({
      payload: {
        guildId: "guild-alpha",
        resourceId: "vip-door",
        walletAddress: "0xabc",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      isVerified: true
    });

    TestRenderer.create(<AccessScanner />);

    await act(async () => {
      const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

      if (!cameraProps) {
        throw new Error("CameraView did not render");
      }

      await cameraProps.onBarcodeScanned?.({ data: "payload" });
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(verifyAndParseAccessQrPayloadMock).toHaveBeenCalledWith("payload");
    expect(routerMocks.replace).toHaveBeenCalledWith({
      pathname: "/access-check",
      params: { qrPayload: "payload" },
    });
  });

  it("ignores duplicate scans while one is processing", async () => {
    mockCameraPermission(createPermissionResponse(true, true));

    let resolveVerification: ((value: unknown) => void) | undefined;
    verifyAndParseAccessQrPayloadMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVerification = resolve;
        }),
    );

    TestRenderer.create(<AccessScanner />);

    const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

    if (!cameraProps) {
      throw new Error("CameraView did not render");
    }

    let firstScanPromise: Promise<void> | undefined;

    await act(async () => {
      firstScanPromise = cameraProps.onBarcodeScanned?.({ data: "payload" });

      await cameraProps.onBarcodeScanned?.({ data: "payload-2" });
    });

    expect(verifyAndParseAccessQrPayloadMock).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).not.toHaveBeenCalled();

    await act(async () => {
      resolveVerification?.({ success: true, payload: { guildId: "g", resourceId: "r" } });
      await firstScanPromise;
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(routerMocks.replace).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).toHaveBeenCalledWith({
      pathname: "/access-check",
      params: { qrPayload: "payload" },
    });
  });

  it.each([
    [
      QR_SIGNATURE_ERROR_CODES_MOCK.REVOKED_KEY,
      qrSignatureMessagesMock[QR_SIGNATURE_ERROR_CODES_MOCK.REVOKED_KEY],
    ],
    [
      QR_SIGNATURE_ERROR_CODES_MOCK.KEY_REGISTRY_EXPIRED,
      qrSignatureMessagesMock[QR_SIGNATURE_ERROR_CODES_MOCK.KEY_REGISTRY_EXPIRED],
    ],
    [
      QR_SIGNATURE_ERROR_CODES_MOCK.INVALID_SIGNATURE_FORMAT,
      qrSignatureMessagesMock[QR_SIGNATURE_ERROR_CODES_MOCK.INVALID_SIGNATURE_FORMAT],
    ],
  ])("shows a specific signature error message for %s", async (code, expectedMessage) => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock.mockRejectedValueOnce(new QrSignatureErrorMock(code));

    const renderer = TestRenderer.create(<AccessScanner />);

    await act(async () => {
      const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

      if (!cameraProps) {
        throw new Error("CameraView did not render");
      }

      await cameraProps.onBarcodeScanned?.({ data: "payload" });
    });

    const output = screenText(renderer);
    expect(describeQrSignatureErrorMock).toHaveBeenCalledWith(code);
    expect(output).toContain(expectedMessage);
    expect(accessibilityInfoMock.announceForAccessibility).toHaveBeenCalledWith(
      `QR code rejected. ${expectedMessage}`,
    );
  });

  it("shows a safe rejection message for invalid or forged QR payloads", async () => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock.mockRejectedValue(new Error("Authorization: Bearer secret-token"));

    const renderer = TestRenderer.create(<AccessScanner />);

    await act(async () => {
      const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

      if (!cameraProps) {
        throw new Error("CameraView did not render");
      }

      await cameraProps.onBarcodeScanned?.({ data: "payload" });
    });

    const output = screenText(renderer);
    expect(output).toContain("QR code rejected");
    expect(output).toContain("Unable to read QR payload.");
    expect(output).not.toContain("Authorization");
    expect(output).not.toContain("Bearer");
    expect(output).not.toContain("secret-token");
  });

  it("restores scanning after an error", async () => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock
      .mockRejectedValueOnce(new Error("forged"))
      .mockResolvedValueOnce({
        payload: {
          guildId: "guild-alpha",
          resourceId: "vip-door",
          walletAddress: "0xabc",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        isVerified: true
      });

    const renderer = TestRenderer.create(<AccessScanner />);

    await act(async () => {
      const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

      if (!cameraProps) {
        throw new Error("CameraView did not render");
      }

      await cameraProps.onBarcodeScanned?.({ data: "bad" });
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Scan Again" }).props.onPress();
    });

    await act(async () => {
      const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

      if (!cameraProps) {
        throw new Error("CameraView did not render");
      }

      await cameraProps.onBarcodeScanned?.({ data: "good" });
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(routerMocks.replace).toHaveBeenCalledWith({
      pathname: "/access-check",
      params: { qrPayload: "good" },
    });
  });

  it("automatically re-arms the scanner guard after a scan error", async () => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock
      .mockRejectedValueOnce(new Error("first error"))
      .mockResolvedValueOnce({
        payload: {
          guildId: "guild-alpha",
          resourceId: "vip-door",
          walletAddress: "0xabc",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        isVerified: true
      });

    TestRenderer.create(<AccessScanner />);

    const getCameraProps = () => {
      const props = cameraViewMock.mock.calls.at(-1)?.[0];
      if (!props) throw new Error("CameraView did not render");
      return props;
    };

    // First scan → error
    await act(async () => {
      await getCameraProps().onBarcodeScanned?.({ data: "bad" });
    });

    // Guard should be reset after error — invoke handler directly on same ref
    await act(async () => {
      await getCameraProps().onBarcodeScanned?.({ data: "good" });
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(routerMocks.replace).toHaveBeenCalledWith({
      pathname: "/access-check",
      params: { qrPayload: "good" },
    });
  });

  it("clears the in-memory history", () => {
    mockCameraPermission(createPermissionResponse(true, true));
    useAccessHistoryStore.setState({
      entries: [
        {
          id: "entry-1",
          guildId: "guild-alpha",
          resourceId: "vip-door",
          resourceName: "VIP Door",
          status: "granted",
          checkedAt: new Date().toISOString(),
          matchedRoles: [],
          requiredRoles: [],
        },
      ],
    });

    const renderer = TestRenderer.create(<AccessScanner />);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Clear History" }).props.onPress();
    });

    expect(useAccessHistoryStore.getState().entries).toStrictEqual([]);
  });
});
