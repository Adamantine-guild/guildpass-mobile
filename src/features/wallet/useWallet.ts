import { useWalletStore } from "./wallet.store";
import { validateAndNormalizeAddress } from "../../lib/walletValidation";
import { createManualConnector } from "./walletConnector.service";
import { WalletConnector } from "./walletConnector.types";
import { useSessionStore } from "../session/session.store";
import { queryClient } from "../../lib/queryClient";
import { clearWalletScopedCache } from "../../lib/walletScopedCache";
import type { WalletAdapter } from "./adapter/walletAdapter.interface";
import { WalletAdapterError } from "./adapter/walletAdapter.interface";

export const useWallet = (): {
  walletAddress: string | null;
  isConnected: boolean;
  isHydrated: boolean;
  connectManually: (address: string) => { success: boolean; error?: string };
  connectWithConnector: (connector: WalletConnector) => Promise<{ success: boolean; error?: string }>;
  connectWithAdapter: (adapter: WalletAdapter) => Promise<{ success: boolean; error?: string }>;
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

  const connectManually = (address: string): { success: boolean; error?: string } => {
    const result = validateAndNormalizeAddress(address);
    if (!result.valid) return { success: false, error: result.error };
    setWalletAddress(result.address);
    void startSession(result.address!);
    return { success: true };
  };

  /**
   * Legacy path — kept for backwards compatibility with the WalletConnector
   * interface used before the WalletAdapter abstraction was introduced.
   */
  const connectWithConnector = async (connector: WalletConnector): Promise<{ success: boolean; error?: string }> => {
    try {
      const accounts = await connector.connect();
      if (!accounts.length) return { success: false, error: "No accounts returned" };
      const result = validateAndNormalizeAddress(accounts[0]);
      if (!result.valid) return { success: false, error: result.error };
      setWalletAddress(result.address);
      await startSession(result.address!);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Connection failed" };
    }
  };

  /**
   * Primary path for all new wallet providers. Accepts any object that
   * implements `WalletAdapter` — ManualAdapter, WalletConnectAdapter,
   * MetaMaskAdapter, CoinbaseAdapter, or a custom/mock adapter.
   *
   * Error codes from `WalletAdapterError` are surfaced in `error` so the UI
   * can show provider-appropriate messages without knowing which SDK is active.
   */
  const connectWithAdapter = async (adapter: WalletAdapter): Promise<{ success: boolean; error?: string }> => {
    try {
      const accounts = await adapter.connect();
      if (!accounts.length) return { success: false, error: "No accounts returned by the wallet." };
      const result = validateAndNormalizeAddress(accounts[0]);
      if (!result.valid) return { success: false, error: result.error };
      setWalletAddress(result.address);
      await startSession(result.address!);
      return { success: true };
    } catch (e) {
      if (e instanceof WalletAdapterError) {
        return { success: false, error: e.message };
      }
      return { success: false, error: e instanceof Error ? e.message : "Connection failed" };
    }
  };

  const disconnect = () => {
    clearWalletScopedCache(queryClient);
    storeDisconnect();
    void endSession();
  };

  return { walletAddress, isConnected, isHydrated, connectManually, connectWithConnector, connectWithAdapter, disconnect };
};

/** Convenience — build a manual connector and connect in one step */
export function buildManualConnector(address: string): WalletConnector {
  return createManualConnector(address);
}
