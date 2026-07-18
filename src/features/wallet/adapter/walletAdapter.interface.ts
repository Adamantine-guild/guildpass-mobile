/**
 * WalletAdapter — the single abstraction that all wallet provider implementations
 * must satisfy. Consuming code (hooks, screens) should only ever reference this
 * interface, never a concrete vendor SDK.
 *
 * Lifecycle
 * ---------
 * 1. `connect()`     — open the provider UI (QR modal, deep-link, etc.) and
 *                      return the user-selected accounts.
 * 2. `getAddress()`  — retrieve the currently active address without triggering
 *                      a new connection flow.
 * 3. `signMessage()` — request an arbitrary personal-sign from the active account.
 * 4. `switchChain()` — ask the provider to switch to the given EVM chain ID.
 * 5. `disconnect()`  — tear down the session/transport cleanly.
 * 6. `onSessionChange()` — register a callback that fires whenever the session
 *                          state changes (account switched, chain switched,
 *                          disconnected by the wallet, etc.).
 *
 * Error handling
 * --------------
 * All methods throw `WalletAdapterError` on failure so callers never have to
 * inspect vendor-specific error shapes.
 */

export type WalletAdapterType =
  | "manual"
  | "walletconnect"
  | "metamask"
  | "coinbase"
  | "mock";

export interface SessionChangeEvent {
  /** New primary address, or `null` when the wallet disconnected. */
  address: string | null;
  /** Active EVM chain ID as a decimal number, or `null` if unknown. */
  chainId: number | null;
}

/**
 * Unified error class. Always includes a human-readable `message` and an
 * optional machine-readable `code` for programmatic handling.
 */
export class WalletAdapterError extends Error {
  constructor(
    message: string,
    public readonly code: WalletAdapterErrorCode = "UNKNOWN",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "WalletAdapterError";
  }
}

export type WalletAdapterErrorCode =
  | "USER_REJECTED"
  | "NOT_CONNECTED"
  | "CHAIN_UNSUPPORTED"
  | "PROVIDER_NOT_FOUND"
  | "SIGNING_FAILED"
  | "CONNECTION_FAILED"
  | "NOT_IMPLEMENTED"
  | "UNKNOWN";

export type SessionChangeCallback = (event: SessionChangeEvent) => void;
export type UnsubscribeFn = () => void;

/**
 * The contract every wallet provider adapter must implement.
 */
export interface WalletAdapter {
  /** Stable identifier for this provider type. */
  readonly type: WalletAdapterType;

  /**
   * Open the provider's connection flow and return the list of granted
   * accounts (Ethereum addresses, lowercase). Throws `WalletAdapterError`
   * if the user rejects or the connection fails.
   */
  connect(): Promise<string[]>;

  /**
   * Cleanly close the session. Must not throw if already disconnected.
   */
  disconnect(): Promise<void>;

  /**
   * Return the currently active address without triggering a new connection
   * flow. Returns `null` when no session is active.
   */
  getAddress(): Promise<string | null>;

  /**
   * Request a personal-sign (`personal_sign`) for `message` using the
   * currently active account. Throws `WalletAdapterError` on rejection or
   * failure.
   */
  signMessage(message: string): Promise<string>;

  /**
   * Ask the provider to switch to `chainId`. A no-op for providers that
   * do not support chain switching (e.g. manual). Throws
   * `WalletAdapterError` with code `CHAIN_UNSUPPORTED` when the wallet
   * cannot honour the request.
   */
  switchChain(chainId: number): Promise<void>;

  /**
   * Register `callback` to be called whenever the session state changes.
   * Returns an unsubscribe function — callers MUST invoke it on cleanup to
   * avoid memory leaks.
   */
  onSessionChange(callback: SessionChangeCallback): UnsubscribeFn;
}
