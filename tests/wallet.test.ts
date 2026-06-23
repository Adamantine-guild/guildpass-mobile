import { describe, it, expect, beforeEach } from "vitest";
import { useWalletStore } from "../src/features/wallet/wallet.store";

describe("Wallet Store", () => {
  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
  });

  it("should update wallet address", () => {
    const address = "0x1234567890123456789012345678901234567890";
    useWalletStore.getState().setWalletAddress(address);

    expect(useWalletStore.getState().walletAddress).toBe(address);
    expect(useWalletStore.getState().isConnected).toBe(true);
  });

  it("should disconnect", () => {
    useWalletStore.setState({
      walletAddress: "0x123",
      isConnected: true,
    });

    useWalletStore.getState().disconnect();

    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
  });
});
