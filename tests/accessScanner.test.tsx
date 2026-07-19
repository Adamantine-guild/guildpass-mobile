import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraPermissions, type PermissionResponse } from "expo-camera/next";
import AccessScanner from "../app/access-scanner";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  SafeAreaView: "SafeAreaView",
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
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
const QrSignatureErrorMock = vi.hoisted(
  () =>
    class QrSignatureError extends Error {
      constructor(message = "Invalid QR signature") {
        super(message);
        this.name = "QrSignatureError";
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

vi.mock("expo-camera/next", () => ({
  useCameraPermissions: vi.fn(),
  CameraView: cameraViewMock,
}));

vi.mock("../src/features/access/verifyQrPayload", () => ({
  verifyAndParseAccessQrPayload: verifyAndParseAccessQrPayloadMock,
}));

vi.mock("../src/features/access/qrSignature", () => ({
  QrSignatureError: QrSignatureErrorMock,
}));

const screenText = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe("AccessScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAccessHistoryStore.setState({ entries: [] });
    cameraViewMock.mockImplementation(() => null);
  });

  it("shows loading state while checking permission", () => {
    mockCameraPermission(null);

    const renderer = TestRenderer.create(<AccessScanner />);

    expect(screenText(renderer)).toContain("Checking camera permission...");
  });

  it("shows permission request when camera not granted and can ask again", () => {
    mockCameraPermission(createPermissionResponse(false, true));

    const renderer = TestRenderer.create(<AccessScanner />);

    expect(screenText(renderer)).toContain("Allow Camera Access");
  });

  it("shows permanent denial message when camera denied and cannot ask again", () => {
    mockCameraPermission(createPermissionResponse(false, false));

    const renderer = TestRenderer.create(<AccessScanner />);

    expect(screenText(renderer)).toContain(
      "Enable camera access in your device settings to scan QR codes.",
    );
  });

  it("shows scanner view when permission is granted", () => {
    mockCameraPermission(createPermissionResponse(true, true));

    const renderer = TestRenderer.create(<AccessScanner />);

    expect(screenText(renderer)).toContain("Point your camera at a GuildPass access QR code.");
  });

  it("shows the recent-history section", () => {
    mockCameraPermission(createPermissionResponse(true, true));

    const renderer = TestRenderer.create(<AccessScanner />);

    expect(screenText(renderer)).toContain("Recent Access Checks");
  });

  it("verifies a valid scan and navigates to the access-check screen", async () => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock.mockResolvedValue({
      guildId: "guild-alpha",
      resourceId: "vip-door",
      walletAddress: "0xabc",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    TestRenderer.create(<AccessScanner />);

    await act(async () => {
      const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

      if (!cameraProps) {
        throw new Error("CameraView did not render");
      }

      await cameraProps.onBarcodeScanned?.({ data: "payload" });
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
      resolveVerification?.({ guildId: "g", resourceId: "r" });
      await firstScanPromise;
    });

    expect(routerMocks.replace).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).toHaveBeenCalledWith({
      pathname: "/access-check",
      params: { qrPayload: "payload" },
    });
  });

  it("shows a signature error message for invalid QR signatures", async () => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock.mockRejectedValueOnce(new QrSignatureErrorMock());

    const renderer = TestRenderer.create(<AccessScanner />);

    await act(async () => {
      const cameraProps = cameraViewMock.mock.calls.at(-1)?.[0];

      if (!cameraProps) {
        throw new Error("CameraView did not render");
      }

      await cameraProps.onBarcodeScanned?.({ data: "payload" });
    });

    const output = screenText(renderer);
    expect(output).toContain("QR code signature is invalid or missing.");
  });

  it("shows a safe rejection message for invalid or forged QR payloads", async () => {
    mockCameraPermission(createPermissionResponse(true, true));
    verifyAndParseAccessQrPayloadMock.mockRejectedValue(
      new Error("Authorization: Bearer secret-token"),
    );

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
        guildId: "guild-alpha",
        resourceId: "vip-door",
        walletAddress: "0xabc",
        expiresAt: "2099-01-01T00:00:00.000Z",
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
          guildName: "Guild Alpha",
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
