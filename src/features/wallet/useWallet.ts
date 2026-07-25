import { useCallback } from "react";
import { useWalletStore } from "./wallet.store";
import { validateAndNormalizeAddress } from "../../lib/walletValidation";
import {
  createManualConnector,
  createWalletConnectConnector,
} from "./walletConnector.service";
import { WalletConnector } from "./walletConnector.types";
import { getWalletConnectProvider } from "./walletConnectSession";
import { endWalletSession, startWalletSession } from "../../lib/walletLifecycle";

export const useWallet = (): {
  walletAddress: string | null;
  isConnected: boolean;
  connectionKind: "manual" | "walletconnect" | "embedded" | "coinbase" | "metamask" | null;
  isHydrated: boolean;
  connectManually: (address: string) => { success: boolean; error?: string };
  /** Store an EVM address created by an embedded wallet provider. */
  connectEmbeddedWallet: (address: string) => Promise<{ success: boolean; error?: string }>;
  connectWithConnector: (connector: WalletConnector) => Promise<{ success: boolean; error?: string }>;
  /** Connect using WalletConnect — requires the WC provider from useWalletConnectModal */
  connectWalletConnect: (provider: {
    request(args: { method: string }): Promise<unknown>;
    disconnect(): Promise<void>;
  }) => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<void>;
} => {
  const walletAddress = useWalletStore((s) => s.walletAddress);
  const isConnected = useWalletStore((s) => s.isConnected);
  const connectionKind = useWalletStore((s) => s.connectionKind);
  const isHydrated = useWalletStore((s) => s._hasHydrated);
  const setWalletAddress = useWalletStore((s) => s.setWalletAddress);
  const storeDisconnect = useWalletStore((s) => s.disconnect);

  const connectManually = (address: string): { success: boolean; error?: string } => {
    const result = validateAndNormalizeAddress(address);
    if (!result.valid) return { success: false, error: result.error };
    setWalletAddress(result.address, "manual");
    void startWalletSession(result.address!);
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
    await startWalletSession(result.address!);
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
      await startWalletSession(result.address!);
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
    [setWalletAddress],
  );

  const disconnect = useCallback(async () => {
    // If connected via WalletConnect, tear down the WC session first
    if (connectionKind === "walletconnect") {
      const wcProvider = getWalletConnectProvider();
      if (wcProvider) {
        await wcProvider.disconnect().catch(() => {});
      }
    }
    // Clear this feature's own state before the cross-feature teardown, so a
    // screen re-rendering mid-disconnect cannot refetch for the outgoing wallet.
    storeDisconnect();
    await endWalletSession();
  }, [connectionKind, storeDisconnect]);

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
