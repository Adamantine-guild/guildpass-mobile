import React, { useEffect, useRef } from "react";
import { WalletConnectModal, useWalletConnectModal } from "@walletconnect/modal-react-native";
import { appConfig } from "../../config/appConfig";
import { useWalletStore } from "./wallet.store";
import { useSessionStore } from "../session/session.store";

// ── Provider metadata for the WalletConnect modal ──────────────────────
const providerMetadata = {
  name: "GuildPass",
  description: "Secure, on-the-go access control and guild management.",
  url: "https://guildpass.xyz",
  icons: ["https://raw.githubusercontent.com/guildpass/brand/main/logo-mobile.png"],
  redirect: {
    native: "guildpass://",
  },
};

const projectId = appConfig.walletConnectProjectId;

// ── Module-level ref so disconnect() in useWallet can access the WC provider ──
let _wcProviderRef: {
  disconnect(): Promise<void>;
} | null = null;

/** Exposed for useWallet disconnect to tear down the WC session. */
export function getWalletConnectProvider() {
  return _wcProviderRef;
}

// ── Inner component — bridges WC modal state into Zustand ─────────────
function WalletConnectBridge({ children }: { children: React.ReactNode }) {
  const { isConnected, address, provider } = useWalletConnectModal();
  const setWalletAddress = useWalletStore((s) => s.setWalletAddress);
  const storeDisconnect = useWalletStore((s) => s.disconnect);
  const storeAddress = useWalletStore((s) => s.walletAddress);
  const storeConnected = useWalletStore((s) => s.isConnected);
  const connectionKind = useWalletStore((s) => s.connectionKind);
  const prevConnected = useRef(false);

  // Keep the module-level ref up to date
  useEffect(() => {
    if (provider) {
      _wcProviderRef = provider;
    }
    return () => {
      _wcProviderRef = null;
    };
  }, [provider]);

  // Sync WC connection → Zustand store + session
  useEffect(() => {
    if (isConnected && address) {
      setWalletAddress(address, "walletconnect");
      // Also start the session
      const { startSession } = useSessionStore.getState();
      void startSession(address);
    }
    // WC disconnected externally → clear store
    if (!isConnected && prevConnected.current && storeAddress) {
      storeDisconnect();
    }
    prevConnected.current = isConnected;
  }, [isConnected, address, setWalletAddress, storeDisconnect, storeAddress]);

  // Bidirectional sync: if store disconnected but WC still thinks it's connected,
  // tear down the WC session
  useEffect(() => {
    if (!storeConnected && isConnected && connectionKind === "walletconnect" && provider) {
      provider.disconnect().catch(() => {});
    }
  }, [storeConnected, isConnected, connectionKind, provider]);

  return <>{children}</>;
}

// ── Public provider — renders WC modal as sibling alongside children ──
export function WalletConnectProvider({ children }: { children: React.ReactNode }) {
  if (!projectId) {
    // No WC project ID configured — skip the modal entirely
    return <WalletConnectBridge>{children}</WalletConnectBridge>;
  }

  return (
    <WalletConnectBridge>
      {children}
      <WalletConnectModal
        projectId={projectId}
        providerMetadata={providerMetadata}
      />
    </WalletConnectBridge>
  );
}

// ── Re-export hook for convenience ────────────────────────────────────
export { useWalletConnectModal };
