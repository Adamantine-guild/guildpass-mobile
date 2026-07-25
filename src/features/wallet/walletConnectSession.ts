/**
 * Holds the live WalletConnect provider outside the React tree.
 *
 * `useWallet.disconnect()` needs to tear down the WC session from a non-component
 * context. Reading it from here rather than from `WalletConnectProvider.tsx` keeps
 * the WC modal package — and a React component — out of `useWallet`'s module graph.
 */

export type WalletConnectSessionProvider = {
  disconnect(): Promise<void>;
};

let activeProvider: WalletConnectSessionProvider | null = null;

export function setWalletConnectProvider(provider: WalletConnectSessionProvider | null): void {
  activeProvider = provider;
}

export function getWalletConnectProvider(): WalletConnectSessionProvider | null {
  return activeProvider;
}
