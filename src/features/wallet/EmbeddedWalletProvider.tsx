import React from "react";
import { PrivyProvider } from "@privy-io/expo";
import { appConfig } from "../../config/appConfig";

/** Whether this build is configured for social/email embedded-wallet onboarding. */
export const isEmbeddedWalletEnabled = Boolean(appConfig.privyAppId && appConfig.privyClientId);

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
      {children}
    </PrivyProvider>
  );
}
