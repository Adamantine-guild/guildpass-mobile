import { useCallback } from "react";
import { useWalletStore } from "./wallet.store";
import { validateAndNormalizeAddress } from "../../lib/walletValidation";
import {
  createEmbeddedConnector,
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
  isVerified: boolean;
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
  verifyOwnership: () => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<void>;
} => {
  const walletAddress = useWalletStore((s) => s.walletAddress);
  const isConnected = useWalletStore((s) => s.isConnected);
  const connectionKind = useWalletStore((s) => s.connectionKind);
  const isHydrated = useWalletStore((s) => s._hasHydrated);
  const setWalletAddress = useWalletStore((s) => s.setWalletAddress);
  const storeDisconnect = useWalletStore((s) => s.disconnect);

  const isVerified = useWalletStore((s) => s.isVerified);
  const setVerified = useWalletStore((s) => s.setVerified);

  const connectManually = (address: string): { success: boolean; error?: string } => {
    const result = validateAndNormalizeAddress(address);
    if (!result.valid) return { success: false, error: result.error };
    setWalletAddress(result.address, "manual", false);
    void startWalletSession(result.address!);
    return { success: true };
  };

  const connectEmbeddedWallet = async (
    address: string,
  ): Promise<{ success: boolean; error?: string }> => {
    // Goes through the same connector path as every other wallet. Downstream code
    // only sees a validated EVM address, never provider-specific user data.
    return connectWithConnector(createEmbeddedConnector(address));
  };

  const connectWithConnector = async (
    connector: WalletConnector,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const accounts = await connector.connect();
      if (!accounts.length) return { success: false, error: "No accounts returned" };
      const result = validateAndNormalizeAddress(accounts[0]);
      if (!result.valid) return { success: false, error: result.error };
      // Connected but not yet verified
      setWalletAddress(result.address, connector.type, false);
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

  const verifyOwnership = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isConnected || !walletAddress) {
      return { success: false, error: "No wallet connected" };
    }
    
    if (connectionKind === "manual") {
      return { success: false, error: "Manual entries cannot be cryptographically verified" };
    }

    try {
      // 1. Get the provider. For WalletConnect, it's stored globally.
      const wcProvider = getWalletConnectProvider();
      if (!wcProvider) {
        return { success: false, error: "No active WalletConnect provider found" };
      }

      // 2. Request signature
      const message = "Sign this message to verify your wallet ownership for GuildPass.";
      
      const { verifyMessage, stringToHex } = await import("viem");
      const hexMessage = stringToHex(message);
      
      const signature = await wcProvider.request({
        method: "personal_sign",
        params: [hexMessage, walletAddress.toLowerCase()],
      }) as string;

      if (!signature) {
        return { success: false, error: "User rejected the signature request" };
      }

      // 3. Verify signature using viem
      const isValid = await verifyMessage({
        address: walletAddress as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });

      if (isValid) {
        setVerified(true);
        return { success: true };
      } else {
        return { success: false, error: "Signature verification failed" };
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Verification failed" };
    }
  }, [isConnected, walletAddress, connectionKind, setVerified]);

  const disconnect = useCallback(async () => {
    // If connected via WalletConnect, tear down the WC session first
    if (connectionKind === "walletconnect") {
      const wcProvider = getWalletConnectProvider();
      if (wcProvider) {
        await wcProvider.disconnect().catch(() => {});
      }
    }
    // If connected via embedded wallet, end the Privy session so the
    // provider doesn't think the user is still authenticated on relaunch.
    if (connectionKind === "embedded") {
      try {
        const { privyLogout } = await import("./privySession");
        await privyLogout();
      } catch {
        // Privy not configured or already logged out — acceptable.
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
    isVerified,
    isHydrated,
    connectManually,
    connectEmbeddedWallet,
    connectWithConnector,
    connectWalletConnect,
    verifyOwnership,
    disconnect,
  };
};

/** Convenience — build a manual connector and connect in one step */
export function buildManualConnector(address: string): WalletConnector {
  return createManualConnector(address);
}
