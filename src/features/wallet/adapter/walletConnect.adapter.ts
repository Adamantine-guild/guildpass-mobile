/**
 * WalletConnectAdapter — implements WalletAdapter on top of the
 * WalletConnect v2 / AppKit SDK.
 *
 * The SDK is intentionally NOT imported at the top level. Instead, a
 * `WalletConnectProvider` duck-type interface is accepted via the constructor.
 * This keeps the adapter fully testable without the real SDK being present, and
 * means the app only needs to resolve the SDK package once per entry point.
 *
 * To wire it up with the real SDK in app/_layout.tsx or a provider component:
 *
 *   import { createAppKit } from '@reown/appkit-react-native'
 *   const modal = createAppKit({ projectId, networks, ... })
 *   const adapter = new WalletConnectAdapter(modal)
 *
 * Until the SDK is added to package.json, this adapter will throw
 * `PROVIDER_NOT_FOUND` when constructed without a provider, matching the
 * existing stub behaviour in walletConnector.service.ts.
 */

import {
  WalletAdapter,
  WalletAdapterError,
  SessionChangeCallback,
  UnsubscribeFn,
  SessionChangeEvent,
} from "./walletAdapter.interface";

/**
 * Minimum surface we need from the WalletConnect / AppKit provider object.
 * This lets us mock it in tests and swap SDK versions without touching this file.
 */
export interface WalletConnectProviderLike {
  open(): Promise<void>;
  disconnect(): Promise<void>;
  getAddress(): string | undefined;
  signMessage(params: { message: string; address: string }): Promise<string>;
  switchNetwork(chainId: number): Promise<void>;
  subscribeEvents(
    callback: (event: { name: string; data: unknown }) => void
  ): () => void;
}

export class WalletConnectAdapter implements WalletAdapter {
  readonly type = "walletconnect" as const;

  private provider: WalletConnectProviderLike;
  private listeners: Set<SessionChangeCallback> = new Set();
  private providerUnsubscribe: (() => void) | null = null;

  constructor(provider: WalletConnectProviderLike) {
    if (!provider) {
      throw new WalletAdapterError(
        "WalletConnectAdapter requires a provider. " +
          "Install @reown/appkit-react-native (or @walletconnect/modal-react-native) " +
          "and pass the initialised modal instance.",
        "PROVIDER_NOT_FOUND"
      );
    }
    this.provider = provider;
    this._subscribeToProvider();
  }

  async connect(): Promise<string[]> {
    try {
      await this.provider.open();
      const address = this.provider.getAddress();
      if (!address) {
        throw new WalletAdapterError(
          "WalletConnect connection completed but no address was returned.",
          "CONNECTION_FAILED"
        );
      }
      return [address.toLowerCase()];
    } catch (err) {
      if (err instanceof WalletAdapterError) throw err;
      throw new WalletAdapterError(
        `WalletConnect connection failed: ${err instanceof Error ? err.message : String(err)}`,
        "CONNECTION_FAILED",
        err
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.provider.disconnect();
    } catch (err) {
      // Swallow — already disconnected states should not bubble.
      if (process.env.NODE_ENV !== "production") {
        console.warn("WalletConnectAdapter.disconnect() swallowed error:", err);
      }
    }
  }

  async getAddress(): Promise<string | null> {
    const address = this.provider.getAddress();
    return address ? address.toLowerCase() : null;
  }

  async signMessage(message: string): Promise<string> {
    const address = await this.getAddress();
    if (!address) {
      throw new WalletAdapterError(
        "Cannot sign message: no active WalletConnect session.",
        "NOT_CONNECTED"
      );
    }
    try {
      return await this.provider.signMessage({ message, address });
    } catch (err) {
      const isRejection =
        err instanceof Error &&
        (err.message.toLowerCase().includes("reject") ||
          err.message.toLowerCase().includes("denied") ||
          err.message.toLowerCase().includes("cancel"));

      throw new WalletAdapterError(
        `WalletConnect signMessage failed: ${err instanceof Error ? err.message : String(err)}`,
        isRejection ? "USER_REJECTED" : "SIGNING_FAILED",
        err
      );
    }
  }

  async switchChain(chainId: number): Promise<void> {
    try {
      await this.provider.switchNetwork(chainId);
    } catch (err) {
      throw new WalletAdapterError(
        `WalletConnect switchChain to ${chainId} failed: ${err instanceof Error ? err.message : String(err)}`,
        "CHAIN_UNSUPPORTED",
        err
      );
    }
  }

  onSessionChange(callback: SessionChangeCallback): UnsubscribeFn {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private _subscribeToProvider(): void {
    this.providerUnsubscribe = this.provider.subscribeEvents((event) => {
      if (
        event.name === "ACCOUNT_CHANGED" ||
        event.name === "ACCOUNT_DISCONNECTED" ||
        event.name === "SESSION_DELETE"
      ) {
        const address = this.provider.getAddress();
        const ev: SessionChangeEvent = {
          address: address ? address.toLowerCase() : null,
          chainId: null,
        };
        this.listeners.forEach((cb) => cb(ev));
      }
    });
  }
}
