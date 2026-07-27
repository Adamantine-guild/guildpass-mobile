import React from "react";
import { render } from "@testing-library/react-native";
import AccessCheck from "../app/access-check";
import { useNetworkStatus } from "../src/features/offline/useNetworkStatus";
import { useWallet } from "../src/features/wallet/useWallet";
import { useAccessCheck } from "../src/features/access/useAccessCheck";
import { useCountdown } from "../src/features/access/useCountdown";
import { useGuilds } from "../src/features/guilds/useGuilds";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";

// Mock dependencies
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ qrPayload: undefined }),
}));
jest.mock("../src/features/offline/useNetworkStatus");
jest.mock("../src/features/wallet/useWallet");
jest.mock("../src/features/access/useAccessCheck");
jest.mock("../src/features/access/useCountdown");
jest.mock("../src/features/guilds/useGuilds");
jest.mock("../src/features/access/accessHistory.store");

describe("AccessCheck Offline Behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWallet as jest.Mock).mockReturnValue({ walletAddress: "0x123" });
    (useAccessCheck as jest.Mock).mockReturnValue({
      data: null,
      error: null,
      isPending: false,
      mutate: jest.fn(),
      reset: jest.fn(),
      perChainRoleEligibility: [],
      isResolvingRoleEligibility: false,
    });
    (useCountdown as jest.Mock).mockReturnValue({
      isExpired: false,
      isExpiringSoon: false,
      label: "Valid",
    });
    (useGuilds as jest.Mock).mockReturnValue({
      useGuild: jest.fn().mockReturnValue({ data: null }),
      useGuildConfig: jest.fn(),
      useRoles: jest.fn(),
    });
    (useAccessHistoryStore as unknown as jest.Mock).mockReturnValue(jest.fn());
  });

  it("disables scan and check buttons and shows warning when offline", () => {
    (useNetworkStatus as jest.Mock).mockReturnValue({ isOffline: true });

    const { getByTestId, getByText } = render(<AccessCheck />);
    
    const scanButton = getByTestId("scan-qr-button");
    // Ensure the disabled prop is passed
    expect(scanButton.props.disabled).toBe(true);
    
    // Warning should be present
    expect(getByText("QR Access Check Requires Internet")).toBeTruthy();
  });

  it("enables scan and check buttons when online", () => {
    (useNetworkStatus as jest.Mock).mockReturnValue({ isOffline: false });

    const { getByTestId, queryByText } = render(<AccessCheck />);
    
    const scanButton = getByTestId("scan-qr-button");
    // Ensure the disabled prop is false
    expect(scanButton.props.disabled).toBe(false);
    
    // Warning should be absent
    expect(queryByText("QR Access Check Requires Internet")).toBeNull();
  });
});
