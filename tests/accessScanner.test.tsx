import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  SafeAreaView: "SafeAreaView",
  StyleSheet: { create: (s) => s },
}));

const mockReplace = vi.fn();
const mockBack = vi.fn();

vi.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
  }),
}));

vi.mock("expo-camera", () => ({
  useCameraPermissions: vi.fn(),
}));

vi.mock("expo-camera/legacy", () => ({
  Camera: () => null,
  CameraType: { back: "back" },
  BarCodeScanningResult: {},
}));

vi.mock("../src/components/AppHeader", () => ({
  AppHeader: ({ title }: { title: string }) => null,
}));

vi.mock("../src/components/Button", () => ({
  Button: ({ title, onPress }: { title: string; onPress: () => void }) => null,
}));

vi.mock("../src/components/Card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => null,
}));

vi.mock("../src/features/access/qrPayload", () => ({
  parseAccessQrPayload: vi.fn(),
}));

// eslint-disable-next-line import/first
import { render } from "@testing-library/react-native";
// eslint-disable-next-line import/first
import { useCameraPermissions } from "expo-camera";
// eslint-disable-next-line import/first
import AccessScanner from "../app/access-scanner";

describe("AccessScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state while checking permission", () => {
    vi.mocked(useCameraPermissions).mockReturnValue([null, vi.fn()]);

    const { getByText } = render(<AccessScanner />);
    expect(getByText("Checking camera permission...")).toBeDefined();
  });

  it("shows permission request when camera not granted and can ask again", () => {
    vi.mocked(useCameraPermissions).mockReturnValue([
      { granted: false, canAskAgain: true },
      vi.fn(),
    ]);

    const { getByText } = render(<AccessScanner />);
    expect(getByText("Allow Camera Access")).toBeDefined();
  });

  it("shows permanent denial message when camera denied and cannot ask again", () => {
    vi.mocked(useCameraPermissions).mockReturnValue([
      { granted: false, canAskAgain: false },
      vi.fn(),
    ]);

    const { getByText } = render(<AccessScanner />);
    expect(getByText(/Enable camera access in your device settings/)).toBeDefined();
  });

  it("shows scanner view when permission is granted", () => {
    vi.mocked(useCameraPermissions).mockReturnValue([
      { granted: true, canAskAgain: true },
      vi.fn(),
    ]);

    const { getByText } = render(<AccessScanner />);
    expect(getByText("Point your camera at a GuildPass access QR code.")).toBeDefined();
  });
});
