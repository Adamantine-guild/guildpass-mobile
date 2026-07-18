import { useWalletStore } from "./wallet.store";
import { validateAndNormalizeAddress } from "../../lib/walletValidation";
import { createManualConnector } from "./walletConnector.service";
import { WalletConnector } from "./walletConnector.types";
import { useSessionStore } from "../session/session.store";
import { createSessionAdapter } from "../session/createSessionAdapter";
import { noopSessionAdapter } from "../session/session.adapter";
import { queryClient } from "../../lib/queryClient";
import { clearWalletScopedCache } from "../../lib/walletScopedCache";

export const useWallet = (): {
  walletAddress: string | null;
  isConnected: boolean;
  isHydrated: boolean;
  connectManually: (address: string) => { success: boolean; error?: string };
  connectWithConnector: (connector: WalletConnector) => Promise<{ success: boolean; error?: string }>;
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

  const connectWithConnector = async (connector: WalletConnector): Promise<{ success: boolean; error?: string }> => {
    try {
      const accounts = await connector.connect();
      if (!accounts.length) return { success: false, error: "No accounts returned" };
      const result = validateAndNormalizeAddress(accounts[0]);
      if (!result.valid) return { success: false, error: result.error };

      // A connector that can sign backs the session with SIWE (proven ownership).
      // One that cannot (e.g. a manually-entered address) falls back to the no-op
      // adapter, which is unproven and must never be treated as authenticated.
      let canSign = false;
      try {
        await connector.signMessage("__can_sign_probe__");
        canSign = true;
      } catch {
        canSign = false;
      }
      const sessionStore = useSessionStore.getState();
      sessionStore.setAdapter(canSign ? createSessionAdapter(connector.signMessage) : noopSessionAdapter);

      setWalletAddress(result.address);
      await startSession(result.address!);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Connection failed" };
    }
  };

  const disconnect = () => {
    clearWalletScopedCache(queryClient);
    storeDisconnect();
    void endSession();
  };

  return { walletAddress, isConnected, isHydrated, connectManually, connectWithConnector, disconnect };
};

/** Convenience — build a manual connector and connect in one step */
export function buildManualConnector(address: string): WalletConnector {
  return createManualConnector(address);
}
