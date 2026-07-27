/**
 * Privy session utilities — lazy-imported by `useWallet` and `resetAppState`
 * so the Privy SDK only enters the module graph when actually configured.
 *
 * The Privy Expo SDK exposes its state through React hooks, which cannot be
 * called outside a component. This module bridges that gap for imperative
 * call sites (disconnect, reset) by accessing the Privy instance through
 * a module-level reference set by `EmbeddedWalletProvider`.
 *
 * IMPORTANT: This module must NOT be statically imported by `useWallet.ts`
 * or `walletConnector.service.ts`. Use dynamic `import("./privySession")`
 * to keep `@privy-io/expo` out of test suites that don't configure it.
 */

type PrivySessionRef = {
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
  getWalletAddress: () => string | null;
};

let _ref: PrivySessionRef | null = null;

/**
 * Called by `EmbeddedWalletProvider` once the Privy SDK is ready.
 * This allows imperative code to call logout without a React hook.
 */
export function setPrivySessionRef(ref: PrivySessionRef | null): void {
  _ref = ref;
}

/**
 * Ends the Privy session. Safe to call when Privy is not configured or
 * the user never signed in — returns silently in both cases.
 */
export async function privyLogout(): Promise<void> {
  if (!_ref) return;
  try {
    await _ref.logout();
  } catch {
    // Already logged out or SDK not initialised — both are acceptable.
  }
}

/**
 * Whether the Privy SDK currently considers the user authenticated.
 * Returns `false` when Privy is not configured.
 */
export function isPrivyAuthenticated(): boolean {
  return _ref?.isAuthenticated() ?? false;
}

/**
 * Returns the embedded wallet address from the Privy SDK, or `null` if
 * the user is not authenticated or has no embedded wallet.
 */
export function getPrivyWalletAddress(): string | null {
  return _ref?.getWalletAddress() ?? null;
}
