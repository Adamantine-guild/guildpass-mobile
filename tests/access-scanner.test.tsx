import React from "react";
import { render } from "@testing-library/react-native";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AccessScanner from "../app/access-scanner";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";

// Mock de expo-camera
vi.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, vi.fn()],
}));

// Mock de expo-router
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

// Mock de expo-clipboard
vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(),
}));

// Mock de useAccessCheck
vi.mock("../src/features/access/useAccessCheck", () => ({
  useAccessCheck: () => ({
    state: { status: "idle" },
    dispatch: vi.fn(),
    startScan: vi.fn(),
    checkAccess: vi.fn(),
    reset: vi.fn(),
  }),
}));

// Mock de Zustand

describe("AccessScanner - Debug Panel", () => {
  beforeEach(() => {
    vi.stubGlobal("__DEV__", true);
    useAccessHistoryStore.setState({ lastDecodedPayload: null });
  });

  it("Escenario A: Muestra el panel de debug si __DEV__ es true y hay un payload", () => {
    vi.stubGlobal("__DEV__", true);

    // Inyectamos un payload en el store mockeado
    useAccessHistoryStore.setState({
      lastDecodedPayload: { guildId: "123", resourceId: "456", walletAddress: "0xABC" },
    });

    const { getByText } = render(<AccessScanner />);

    // Verificamos que el panel se renderiza buscando el título del debug panel
    expect(getByText("Debug QR Payload")).toBeTruthy();
    // Verificamos que el contenido JSON se muestra
    expect(getByText(/123/)).toBeTruthy();
  });

  it("Escenario B: No muestra el panel si __DEV__ es false, incluso con payload", () => {
    vi.stubGlobal("__DEV__", false);

    useAccessHistoryStore.setState({
      lastDecodedPayload: { guildId: "123", resourceId: "456", walletAddress: "0xABC" },
    });

    const { queryByText } = render(<AccessScanner />);

    // Verificamos que el panel NO se renderiza bajo ninguna circunstancia
    expect(queryByText("Debug QR Payload")).toBeNull();
  });
});
