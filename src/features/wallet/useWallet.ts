import { useCallback } from "react";
import { useWalletStore } from "./wallet.store";
import { validateAndNormalizeAddress } from "../../lib/walletValidation";
import { createManualConnector, createWalletConnectConnector } from "./walletConnector.service";
import { WalletConnector } from "./walletConnector.types";
import { useSessionStore } from "../session/session.store";
import { queryClient } from "../../lib/queryClient";
import { clearWalletScopedCache } from "../../lib/walletScopedCache";
import { useSyncStore } from "../sync/sync.store";

export const useWallet = (): {
  walletAddress: string | null;
  isConnected: boolean;
  connectionKind: "manual" | "walletconnect" | "embedded" | "coinbase" | "metamask" | null;
  isHydrated: boolean;
  connectManually: (address: string) => { success: boolean; error?: string };
  /** Store an EVM address created by an embedded wallet provider. */
  connectEmbeddedWallet: (address: string) => Promise<{ success: boolean; error?: string }>;
  connectWithConnector: (
    connector: WalletConnector,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Connect using WalletConnect — requires the WC provider from useWalletConnectModal */
  connectWalletConnect: (provider: {
    request(args: { method: string }): Promise<unknown>;
    disconnect(): Promise<void>;
  }) => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<void>;
} => {
  const {
    walletAddress,
    isConnected,
    connectionKind,
    _hasHydrated: isHydrated,
    setWalletAddress,
    disconnect: storeDisconnect,
  } = useWalletStore();
  const { startSession, endSession } = useSessionStore.getState();

  const connectManually = (address: string): { success: boolean; error?: string } => {
    const result = validateAndNormalizeAddress(address);
    if (!result.valid) return { success: false, error: result.error };
    setWalletAddress(result.address, "manual");
    void startSession(result.address!);
    return { success: true };
  };

  const connectEmbeddedWallet = async (
    address: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const result = validateAndNormalizeAddress(address);
    if (!result.valid) return { success: false, error: result.error };
    // This intentionally writes to the normal wallet store. Downstream code
    // only sees a validated EVM address, never provider-specific user data.
    setWalletAddress(result.address, "embedded");
    await startSession(result.address!);
    return { success: true };
  };

  const connectWithConnector = async (
    connector: WalletConnector,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const accounts = await connector.connect();
      if (!accounts.length) return { success: false, error: "No accounts returned" };
      const result = validateAndNormalizeAddress(accounts[0]);
      if (!result.valid) return { success: false, error: result.error };
      setWalletAddress(result.address, connector.type);
      await startSession(result.address!);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Connection failed" };
    }
  };

  const connectWalletConnect = useCallback(
    async (provider: {
      request(args: { method: string }): Promise<unknown>;
      disconnect(): Promise<void>;
    }): Promise<{ success: boolean; error?: string }> => {
      const connector = createWalletConnectConnector(provider);
      return connectWithConnector(connector);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setWalletAddress, startSession],
  );

  const disconnect = useCallback(async () => {
    // If connected via WalletConnect, tear down the WC session first
    if (connectionKind === "walletconnect") {
      const { getWalletConnectProvider } = require("./WalletConnectProvider");
      const wcProvider = getWalletConnectProvider();
      if (wcProvider) {
        await wcProvider.disconnect().catch(() => {});
      }
    }
    clearWalletScopedCache(queryClient);
    // Sync corrections/metadata are wallet-scoped state too — a new wallet
    // must not see the previous wallet's "your access changed" notices.
    useSyncStore.getState().clearSyncState();
    storeDisconnect();
    void endSession();
  }, [connectionKind, storeDisconnect, endSession]);

  return {
    walletAddress,
    isConnected,
    connectionKind,
    isHydrated,
    connectManually,
    connectEmbeddedWallet,
    connectWithConnector,
    connectWalletConnect,
    disconnect,
  };
};

/** Convenience — build a manual connector and connect in one step */
export function buildManualConnector(address: string): WalletConnector {
  return createManualConnector(address);
}
