import { useWalletStore } from "./wallet.store";
import { validateAndNormalizeAddress } from "../../lib/walletValidation";
import { createManualConnector, createEmbeddedConnector } from "./walletConnector.service";
import { WalletConnector } from "./walletConnector.types";
import { getEmbeddedWalletProvider } from "./embeddedWallet.provider";
import type { SocialLoginMethod, SocialLoginParams } from "./embeddedWallet.types";
import { useSessionStore } from "../session/session.store";
import { queryClient } from "../../lib/queryClient";
import { clearWalletScopedCache } from "../../lib/walletScopedCache";

export const useWallet = (): {
  walletAddress: string | null;
  isConnected: boolean;
  isHydrated: boolean;
  connectManually: (address: string) => { success: boolean; error?: string };
  connectWithConnector: (connector: WalletConnector) => Promise<{ success: boolean; error?: string }>;
  connectWithSocial: (
    method: SocialLoginMethod,
    params?: SocialLoginParams,
  ) => Promise<{ success: boolean; error?: string }>;
  disconnect: () => void;
} => {
  const {
    walletAddress,
    isConnected,
    _hasHydrated: isHydrated,
    setWalletAddress,
    disconnect: storeDisconnect,
  } = useWalletStore();
  const { startSession, endSession } = useSessionStore.getState();

  // Connecting over an existing connection (e.g. re-onboarding with a
  // different wallet) must not leak the previous wallet's cached
  // memberships/roles to the new one.
  const adoptAddress = (address: string) => {
    const previous = useWalletStore.getState().walletAddress;
    if (previous && previous !== address) {
      clearWalletScopedCache(queryClient);
    }
    setWalletAddress(address);
  };

  const connectManually = (address: string): { success: boolean; error?: string } => {
    const result = validateAndNormalizeAddress(address);
    if (!result.valid) return { success: false, error: result.error };
    adoptAddress(result.address!);
    void startSession(result.address!);
    return { success: true };
  };

  const connectWithConnector = async (connector: WalletConnector): Promise<{ success: boolean; error?: string }> => {
    try {
      const accounts = await connector.connect();
      if (!accounts.length) return { success: false, error: "No accounts returned" };
      const result = validateAndNormalizeAddress(accounts[0]);
      if (!result.valid) return { success: false, error: result.error };
      adoptAddress(result.address!);
      await startSession(result.address!);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Connection failed" };
    }
  };

  const connectWithSocial = (method: SocialLoginMethod, params?: SocialLoginParams) =>
    connectWithConnector(createEmbeddedConnector(getEmbeddedWalletProvider(), method, params));

  const disconnect = () => {
    clearWalletScopedCache(queryClient);
    // Idempotent for every provider; revokes embedded session/key material
    // when the active wallet came from social onboarding.
    void getEmbeddedWalletProvider().logout();
    storeDisconnect();
    void endSession();
  };

  return {
    walletAddress,
    isConnected,
    isHydrated,
    connectManually,
    connectWithConnector,
    connectWithSocial,
    disconnect,
  };
};

/** Convenience — build a manual connector and connect in one step */
export function buildManualConnector(address: string): WalletConnector {
  return createManualConnector(address);
}
