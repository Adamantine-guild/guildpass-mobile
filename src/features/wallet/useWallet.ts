import { useCallback } from "react";
import { useWalletStore } from "./wallet.store";
import { validateAndNormalizeAddress } from "../../lib/walletValidation";
import {
  createManualConnector,
  createWalletConnectConnector,
} from "./walletConnector.service";
import { WalletConnector } from "./walletConnector.types";
import { useSessionStore } from "../session/session.store";
import { queryClient } from "../../lib/queryClient";
import { clearWalletScopedCache } from "../../lib/walletScopedCache";

export const useWallet = (): {
  walletAddress: string | null;
  isConnected: boolean;
  connectionKind: "manual" | "walletconnect" | "coinbase" | "metamask" | null;
  isHydrated: boolean;
  connectManually: (address: string) => { success: boolean; error?: string };
  connectWithConnector: (connector: WalletConnector) => Promise<{ success: boolean; error?: string }>;
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
    storeDisconnect();
    void endSession();
  }, [connectionKind, storeDisconnect, endSession]);

  return {
    walletAddress,
    isConnected,
    connectionKind,
    isHydrated,
    connectManually,
    connectWithConnector,
    connectWalletConnect,
    disconnect,
  };
};

/** Convenience — build a manual connector and connect in one step */
export function buildManualConnector(address: string): WalletConnector {
  return createManualConnector(address);
}
