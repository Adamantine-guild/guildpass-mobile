import React, { useEffect } from "react";
import { PrivyProvider, usePrivy, useEmbeddedEthereumWallet } from "@privy-io/expo";
import { appConfig } from "../../config/appConfig";
import { setPrivySessionRef } from "./privySession";
import { useWalletStore } from "./wallet.store";
import { endWalletSession } from "../../lib/walletLifecycle";

/** Whether this build is configured for social/email embedded-wallet onboarding. */
export const isEmbeddedWalletEnabled = Boolean(appConfig.privyAppId && appConfig.privyClientId);

/**
 * Bridges the Privy React-hook state into the imperative `privySession` module
 * so non-component code (disconnect, reset) can call `privyLogout()`.
 *
 * Also acts as a cold-start session guard: if the Zustand wallet store
 * rehydrates with `connectionKind: "embedded"` but Privy is no longer
 * authenticated (session expired between launches), the guard forces a
 * clean disconnect so the user re-onboards rather than operating with a
 * stale embedded address.
 */
function PrivySessionBridge() {
  const { isReady, authenticated, logout } = usePrivy();
  const { wallets } = useEmbeddedEthereumWallet();

  // Keep the imperative ref up to date for non-component callers
  useEffect(() => {
    if (!isReady) return;

    setPrivySessionRef({
      logout,
      isAuthenticated: () => authenticated,
      getWalletAddress: () => wallets[0]?.address ?? null,
    });

    return () => {
      setPrivySessionRef(null);
    };
  }, [isReady, authenticated, logout, wallets]);

  // ── Cold-start session guard ──────────────────────────────────────
  // Runs once Privy reports ready. If the wallet store thinks we're on an
  // embedded wallet but Privy disagrees, tear down the stale session.
  useEffect(() => {
    if (!isReady) return;

    const { connectionKind, isConnected } = useWalletStore.getState();
    if (connectionKind === "embedded" && isConnected && !authenticated) {
      // Privy session expired — force clean disconnect
      useWalletStore.getState().disconnect();
      void endWalletSession();
    }
  }, [isReady, authenticated]);

  return null;
}

/**
 * Keeps the SDK optional for development builds that do not have Privy keys.
 * In configured builds Privy creates an Ethereum wallet at login; its address
 * is then copied into the normal GuildPass wallet store.
 */
export function EmbeddedWalletProvider({ children }: { children: React.ReactNode }) {
  if (!isEmbeddedWalletEnabled) return <>{children}</>;

  return (
    <PrivyProvider
      appId={appConfig.privyAppId!}
      clientId={appConfig.privyClientId!}
      config={{ embedded: { ethereum: { createOnLogin: "users-without-wallets" } } }}
    >
      <PrivySessionBridge />
      {children}
    </PrivyProvider>
  );
}
