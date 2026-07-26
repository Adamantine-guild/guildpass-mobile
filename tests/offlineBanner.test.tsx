import React from "react";
import { render } from "@testing-library/react-native";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { useNetworkStatus } from "../src/features/offline/useNetworkStatus";
import { useSyncStatus } from "../src/features/sync/useSyncStatus";
import { formatLastSyncedAt } from "../src/lib/offlineCache";

// Mock the hooks
jest.mock("../src/features/offline/useNetworkStatus");
jest.mock("../src/features/sync/useSyncStatus");
jest.mock("../src/lib/offlineCache", () => ({
  formatLastSyncedAt: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 40 }),
}));

describe("OfflineBanner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not render when online", () => {
    (useNetworkStatus as jest.Mock).mockReturnValue({ isOffline: false });
    (useSyncStatus as jest.Mock).mockReturnValue({ lastSyncCompletedAt: null });

    const { queryByTestId } = render(<OfflineBanner />);
    expect(queryByTestId("offline-banner")).toBeNull();
  });

  it("renders when offline without a last synced time", () => {
    (useNetworkStatus as jest.Mock).mockReturnValue({ isOffline: true });
    (useSyncStatus as jest.Mock).mockReturnValue({ lastSyncCompletedAt: null });
    (formatLastSyncedAt as jest.Mock).mockReturnValue(null);

    const { getByTestId, queryByTestId, getByText } = render(<OfflineBanner />);
    
    expect(getByTestId("offline-banner")).toBeTruthy();
    expect(getByText("Offline — showing cached data")).toBeTruthy();
    expect(queryByTestId("offline-banner-last-synced")).toBeNull();
  });

  it("renders when offline with a last synced time", () => {
    (useNetworkStatus as jest.Mock).mockReturnValue({ isOffline: true });
    (useSyncStatus as jest.Mock).mockReturnValue({ lastSyncCompletedAt: 1234567890 });
    (formatLastSyncedAt as jest.Mock).mockReturnValue("10/24/2023, 10:00:00 AM");

    const { getByTestId, getByText } = render(<OfflineBanner />);
    
    expect(getByTestId("offline-banner")).toBeTruthy();
    expect(getByText("Offline — showing cached data")).toBeTruthy();
    expect(getByText("as of 10/24/2023, 10:00:00 AM")).toBeTruthy();
  });
});
