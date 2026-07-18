/**
 * MockAdapter — a fully controllable in-memory WalletAdapter implementation.
 *
 * Purpose
 * -------
 * Demonstrates the acceptance criterion: "Adding a new wallet provider requires
 * implementing only the WalletAdapter interface, with zero changes to consuming
 * UI/feature code."
 *
 * This adapter is also used in unit tests for anything that consumes a
 * WalletAdapter (useWallet, AdapterRegistry, etc.) without needing real SDKs.
 *
 * Usage in tests
 * --------------
 *   const mock = new MockAdapter("0x1234...abcd");
 *   // Pre-configure behaviour:
 *   mock.connectShouldReject = true;
 *   mock.signMessageResult = "0xsignature";
 *   // Drive session-change events:
 *   mock.emitSessionChange({ address: "0xnew...", chainId: 1 });
 */

import {
  WalletAdapter,
  WalletAdapterError,
  SessionChangeCallback,
  UnsubscribeFn,
  SessionChangeEvent,
} from "./walletAdapter.interface";

export class MockAdapter implements WalletAdapter {
  readonly type = "mock" as const;

  // --- Configuration knobs ---

  /** When true, `connect()` throws `USER_REJECTED`. */
  connectShouldReject = false;

  /** When true, `signMessage()` throws `USER_REJECTED`. */
  signShouldReject = false;

  /** When set, `signMessage()` returns this value instead of a default stub. */
  signMessageResult: string | null = null;

  /** When true, `switchChain()` throws `CHAIN_UNSUPPORTED`. */
  switchChainShouldReject = false;

  // --- Call counters (for assertions) ---

  connectCallCount = 0;
  disconnectCallCount = 0;
  getAddressCallCount = 0;
  signMessageCallCount = 0;
  switchChainCallCount = 0;

  // --- Internal state ---

  private address: string | null;
  private chainId: number | null = null;
  private listeners: Set<SessionChangeCallback> = new Set();

  constructor(address: string | null = null) {
    this.address = address;
  }

  async connect(): Promise<string[]> {
    this.connectCallCount++;
    if (this.connectShouldReject) {
      throw new WalletAdapterError("MockAdapter: connect rejected", "USER_REJECTED");
    }
    if (!this.address) {
      throw new WalletAdapterError("MockAdapter: no address configured", "CONNECTION_FAILED");
    }
    this.emitSessionChange({ address: this.address, chainId: this.chainId });
    return [this.address];
  }

  async disconnect(): Promise<void> {
    this.disconnectCallCount++;
    this.address = null;
    this.emitSessionChange({ address: null, chainId: null });
  }

  async getAddress(): Promise<string | null> {
    this.getAddressCallCount++;
    return this.address;
  }

  async signMessage(message: string): Promise<string> {
    this.signMessageCallCount++;
    if (this.signShouldReject) {
      throw new WalletAdapterError("MockAdapter: sign rejected", "USER_REJECTED");
    }
    if (this.signMessageResult !== null) {
      return this.signMessageResult;
    }
    return `mock-signature(${message.slice(0, 16)})`;
  }

  async switchChain(chainId: number): Promise<void> {
    this.switchChainCallCount++;
    if (this.switchChainShouldReject) {
      throw new WalletAdapterError(
        `MockAdapter: chain ${chainId} not supported`,
        "CHAIN_UNSUPPORTED"
      );
    }
    this.chainId = chainId;
    this.emitSessionChange({ address: this.address, chainId });
  }

  onSessionChange(callback: SessionChangeCallback): UnsubscribeFn {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Test helper — manually fire a session-change event to all registered listeners.
   */
  emitSessionChange(event: SessionChangeEvent): void {
    this.listeners.forEach((cb) => cb(event));
  }

  /**
   * Test helper — update the mock address (does NOT fire session-change).
   * Use `emitSessionChange` if you want listeners to be notified.
   */
  setAddress(address: string | null): void {
    this.address = address;
  }

  /** Reset all state and call counters to defaults. */
  reset(address: string | null = null): void {
    this.address = address;
    this.chainId = null;
    this.connectShouldReject = false;
    this.signShouldReject = false;
    this.signMessageResult = null;
    this.switchChainShouldReject = false;
    this.connectCallCount = 0;
    this.disconnectCallCount = 0;
    this.getAddressCallCount = 0;
    this.signMessageCallCount = 0;
    this.switchChainCallCount = 0;
    this.listeners.clear();
  }
}
